/*
Linny-R is an executable graphical specification language for (mixed integer)
linear programming (MILP) problems, especially unit commitment problems (UCP).
The Linny-R language and tool have been developed by Pieter Bots at Delft
University of Technology, starting in 2009. The project to develop a browser-
based version started in 2017. See https://linny-r.org for more information.

This JavaScript file (linny-r-gui-rcvr.js) provides the GUI functionality
for the receiver: listen with a certain frequency to a "channel" to see
whether a remote RUN command for a specified experiment/model should be
executed, perform this operation, and write report files to the user space.

*/

/*
Copyright (c) 2017-2024 Delft University of Technology

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies
of the Software, and to permit persons to whom the Software is furnished to do
so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

// CLASS GUIReceiver defines a listener/interpreter for commands from local host
class GUIReceiver {
  constructor() {
    this.channel_modal = new ModalDialog('channel');
    this.channel_modal.ok.addEventListener('click',
        () => RECEIVER.activate());
    this.channel_modal.cancel.addEventListener('click',
        () => RECEIVER.channel_modal.hide());
    this.channel_modal.element('path').title =
        'URL a of public channel, or path to a directory on local host\n' +
        `(use shorthand @ for ${PUBLIC_LINNY_R_URL}/channel/)`;
    this.channel_modal.element('callback').title =
        'Path to Linny-R command file\n' +
        '(default path: (main)/command/; default extension: .lrc)';
    // NOTE: each receiver instance listens to a "channel", being the directory
    // on the local host specified by the modeler
    this.channel = '';
    // The file name is the name of the first Linny-R model file or command file
    // that was found in the channel directory
    this.file_name = '';
    // The name of the experiment to be run can be specified in a command file
    this.experiment = '';
    // The call-back script is the path (on the local host) to the Python script
    // that is to be executed after a successful run
    this.call_back_script = '';
    this.active = false;
    this.solving = false;
    this.interval = 1000;
    this.error = '';
    this.log_lines = [];
    // NOTE: hide receiver button unless on a local server (127.0.0.1)
    if(window.location.href.indexOf('/127.0.0.1') < 0) {
      UI.buttons.receiver.classList.add('off');
    }
  }
  
  setError(msg) {
    // Record and display error message, and immediately stop listening
    this.error = msg;
    UI.warn(this.error);
    this.deactivate();
  }
  
  log(msg) {
    // Logs a message displayed on the status line while solving.
    if(this.active || MODEL.report_results) {
      if(!msg.startsWith('[')) {
        const
            d = new Date(),
            now = d.getHours() + ':' +
                d.getMinutes().toString().padStart(2, '0') + ':' +
                d.getSeconds().toString().padStart(2, '0');
        msg = `[${now}] ${msg}`;
      }
      this.log_lines.push(msg);
    }
  }
  
  get logReport() {
    // Returns log lines as a single string, and clears the log
    const report = this.log_lines.join('\n');
    this.log_lines.length = 0;
    return report;
  }

  activate() {
    // Sets channel path and (optional) call-back script
    this.channel = this.channel_modal.element('path').value.trim();
    this.call_back_script = this.channel_modal.element('callback').value.trim();
    // Default channel is the `channel` sub-directory
    if(this.channel === '') this.channel = 'channel';
    // Clear experiment, error message and log
    this.experiment = '';
    this.error = '';
    this.log_lines.length = 0;
    this.active = true;
    this.listen();
    UI.buttons.receiver.classList.add('blink');
    UI.notify(`Started listening at <tt>${this.channel}</tt>`);
    this.channel_modal.hide();
  }
  
  deactivate() {
    // Stops the receiver from listening at the channel
    this.active = false;
    UI.buttons.receiver.classList.remove('blink');
  }
  
  toggle() {
    // Responds to receiver ON/OFF button at top bar
    if(this.active) {
      this.deactivate();
      // NOTE: only notify when the modeler deactivates, so as to prevent
      // overwriting error messages on the status line
      UI.notify(`Stopped listening at <tt>${this.channel}</tt>`);
    } else {
      // Show channel dialog
      this.channel_modal.element('path').value = this.channel;
      this.channel_modal.element('callback').value = this.call_back_script;
      this.channel_modal.show('path');
    }
  }
  
  listen() {
    // If active, checks with local server whether there is a new command
    if(!this.active) return;
    fetch('receiver/', postData({path: this.channel, action: 'listen'}))
      .then((response) => {
          if(!response.ok) {
            UI.alert(`ERROR ${response.status}: ${response.statusText}`);
          }
          return response.text();
        })
      .then((data) => {
          if(UI.postResponseOK(data)) {
            let jsr;
            try {
              jsr = JSON.parse(data);
            } catch(err) {
              console.log('ERROR while parsing JSON:', err);
              RECEIVER.setError('SERVER ERROR: ' + data.slice(0, 250));
              return;
            }
            if(jsr.stop) {
              UI.notify('Receiver deactivated by script');
              RECEIVER.deactivate();
            } else if(jsr.file === '') {
              // Nothing to do => check again after the set time interval
              setTimeout(() => RECEIVER.listen(), RECEIVER.interval);
              return;
            } else if(jsr.file && jsr.model) {
              RECEIVER.file_name = jsr.file;
              let msg = '';
              if(!UI.loadModelFromXML(jsr.model)) {
                msg = 'ERROR: Received model is not valid';
              } else if(jsr.experiment) {
                EXPERIMENT_MANAGER.selectExperiment(jsr.experiment);
                if(!EXPERIMENT_MANAGER.selected_experiment) {
                  msg = `ERROR: Unknown experiment "${jsr.experiment}"`;
                } else {
                  RECEIVER.experiment = jsr.experiment;
                }
              }
              if(msg) {
                RECEIVER.setError(msg);
                // Record abort on local host
                fetch('receiver/', postData({
                      path: RECEIVER.channel,
                      file: RECEIVER.file_name,
                      action: 'abort',
                      log: RECEIVER.logReport
                    }))
                  .then((response) => {
                      if(!response.ok) {
                        UI.alert(
                            `ERROR ${response.status}: ${response.statusText}`);
                      }
                      return response.text();
                    })
                  .then((data) => {
                      // Always show response on status line
                      UI.postResponseOK(data, true);
                      // Keep listening, so check again after the time interval
                      setTimeout(() => RECEIVER.listen(), RECEIVER.interval);
                    })
                  .catch((err) => UI.warn(UI.WARNING.NO_CONNECTION, err));
              } else {
                RECEIVER.log('Executing: ' + RECEIVER.file_name);
                // NOTE: Virtual Machine will trigger the receiver's reporting
                // action each time the model has been solved
                if(RECEIVER.experiment) {
                  RECEIVER.log('Starting experiment: ' + RECEIVER.experiment);
                  EXPERIMENT_MANAGER.startExperiment();
                } else {
                  VM.solveModel();
                }
              }
            } else {
              RECEIVER.setError('Receiver issue: ' + response);
            }
          }
        })
      .catch((err) => UI.warn(UI.WARNING.NO_CONNECTION, err));
  }

  report() {
    // Posts the run results to the local server, or signals an error
    let form,
        run = '',
        path = this.channel,
        file = this.file_name;
    // NOTE: Always set `solving` to FALSE
    this.solving = false;
    // NOTE: When reporting receiver while is not active, report the
    // results of the running experiment.
    if(this.experiment || !this.active) {
      if(MODEL.running_experiment) {
        run = MODEL.running_experiment.active_combination_index;
        this.log(`Reporting: ${file} (run #${run})`);
      }
    }
    // NOTE: If receiver is not active, path and file must be set.
    if(!this.active) {
      path = 'user/reports';
      // NOTE: The @ will be replaced by the run number, so that that
      // number precedes the clock time. The @ will be unique because
      // `asFileName()` replaces special characters by underscores. 
      file = asFileName(MODEL.name || 'model') + '@-' + compactClockTime();
    }
    if(MODEL.solved && !VM.halted) {
      // Normal execution termination => report results
      const od = MODEL.outputData;
      form = {
          path: path,
          file: file,
          action: 'report',
          run: run,
          data: od[0],
          stats: od[1],
          log: RECEIVER.logReport
        };
    } else {
      if(!VM.halted && !this.error) {
        // No apparent cause => log this irregularity
        this.setError('ERROR: Unknown solver problem');
      }
      form = {
          path: this.channel,
          file: this.file_name,
          action: 'abort',
          log: this.logReport
        };
    }
    fetch('receiver/', postData(form))
      .then((response) => {
          if(!response.ok) {
            UI.alert(`ERROR ${response.status}: ${response.statusText}`);
          }
          return response.text();
        })
      .then((data) => {
          // For experiments, only display server response if warning or error.
          UI.postResponseOK(data, !RECEIVER.experiment);
          // If execution completed, perform the call-back action if the
          // receiver is active (so not when auto-reporting a run).
          // NOTE: for experiments, call-back is performed upon completion by
          // the Experiment Manager.
          if(RECEIVER.active && !RECEIVER.experiment) RECEIVER.callBack();
        })
      .catch((err) => UI.warn(UI.WARNING.NO_CONNECTION, err));
  }

  callBack() {
    // Deletes the file in the channel directory (to prevent executing it again)
    // and activates the call-back script on the local server
    fetch('receiver/', postData({
          path: this.channel,
          file: this.file_name,
          action: 'call-back',
          script: this.call_back_script
        }))
      .then((response) => {
          if(!response.ok) {
            UI.alert(`ERROR ${response.status}: ${response.statusText}`);
          }
          return response.text();
        })
      .then((data) => {
          // Call-back completed => resume listening unless running experiment
          if(RECEIVER.experiment) {
            // For experiments, only display server response if warning or error
            UI.postResponseOK(data);
          } else {
            // Always show server response for single runs
            if(UI.postResponseOK(data, true)) {
              // NOTE: resume listening only if no error
              setTimeout(() => RECEIVER.listen(), RECEIVER.interval);
            } else {
              RECEIVER.deactivate();
            }
          }
        })
      .catch((err) => UI.warn(UI.WARNING.NO_CONNECTION, err));
  }

} // END of class GUIReceiver
