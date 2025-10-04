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
Copyright (c) 2017-2025 Delft University of Technology

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
    this.selector = this.channel_modal.element('name');
    this.call_back_box = this.channel_modal.element('callback');
    this.call_back_label = this.channel_modal.element('callback-lbl');
    this.selector.addEventListener('change',
        () => RECEIVER.changeChannel());
    // NOTE: The receiver listens to a "channel", typically a sub-directory
    // of the user workspace on the local host, specified by the modeler.
    // All communication takes place via files in this sub-directory.
    this.channel = '';
    // The channel list is updated each time the channel modal is shown.
    this.channel_list = [];
    // The name of the experiment to be run can be specified in a JSON file.
    this.experiment = '';
    // The prefix for report file names may be specified in a receiver command.
    this.report_prefix = '';
    // The call-back mechanism must be enabled by the modeler (via checkbox
    // in dialog), otherwise the channel's call-back command is not executed.
    this.call_back = false;
    this.active = false;
    this.solving = false;
    this.interval = 1000;
    this.error = '';
    this.log_lines = [];
    // NOTE: Hide receiver button unless on a local server (127.0.0.1), as
    // for there the.
    if(window.location.href.indexOf('/127.0.0.1') < 0) {
      UI.buttons.receiver.classList.add('off');
    }
  }
  
  setError(msg) {
    // Record and display error message, and immediately stop listening.
    this.error = msg;
    UI.warn(this.error);
    this.deactivate();
  }
  
  log(msg) {
    // Log a message displayed on the status line while solving.
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
    // Return log lines as a single string, and clear the log.
    const report = this.log_lines.join('\n');
    this.log_lines.length = 0;
    return report;
  }

  activate() {
    // Set channel name, and permit call-back if box is checked.
    const
        cn = this.selector.value.trim(),
        new_channel = cn !== this.channel,
        callback_was_off = !this.call_back;
    this.channel = cn;
    if(!this.channel) {
      let msg = 'No channel activated';
      if(!this.selector.length) msg += '&ndash; To add a channel, ' +
          'create a sub-directory of (Linny-R)/user/channel/';
      UI.notify(msg);
      this.channel_modal.hide();
      // NOTE: Just in case, deactivate when channel is switched to none.
      if(new_channel) this.deactivate();
      return;
    }
    this.call_back = UI.boxChecked('channel-callback');
    // Clear report name, experiment, error message and log.
    this.report_name = '';
    this.experiment = '';
    this.error = '';
    this.log_lines.length = 0;
    this.active = true;
    if(this.call_back && (new_channel || callback_was_off)) {
      console.log('HERE calling back');
      this.callBack();
    }
    this.listen();
    UI.buttons.receiver.classList.add('blink');
    UI.notify(`Started listening at <tt>${this.channel}</tt>`);
    this.channel_modal.hide();
  }
  
  deactivate() {
    // Stop the receiver from listening at the channel.
    this.active = false;
    UI.buttons.receiver.classList.remove('blink');
  }
  
  toggle() {
    // Respond to receiver ON/OFF button at top bar.
    if(this.active) {
      this.deactivate();
      // NOTE: Only notify when the modeler deactivates, so as to prevent
      // overwriting error messages on the status line.
      UI.notify(`Stopped listening at <tt>${this.channel}</tt>`);
    } else {
      // Clear the channel list and disable input elements -- They will be
      // updated when the FETCH is successful.
      this.selector.innerHTML = '';
      this.selector.disabled = true;
      this.call_back_box.classList.add('disab');
      this.call_back_label.classList.add('lbl-disab');
      // Fetch the channel list.
      fetch('receiver/', postData({action: 'channel-list'}))
        .then(UI.fetchText)
        .then((data) => {
            if(!UI.postResponseOK(data)) {
              UI.alert('Receiver issue: ' + data);
            } else {
              try {
                RECEIVER.channel_list = JSON.parse(data);
                if(RECEIVER.channel_list.length) {
                  // Create the options list with channel names.
                  const options = [];
                  for(const c of RECEIVER.channel_list) {
                    // Add call-back arrow symbol if cal-back is possible. 
                    const
                        opt = c.name + (c.callback ? ' &#x21F5;': ''),
                        sel = (c.name === RECEIVER.channel ? ' selected' : '');
                    options.push(`<option value="${c.name}"${sel}>${opt}</option>`);
                  }
                  RECEIVER.selector.innerHTML = options.join('');
                  RECEIVER.selector.disabled = false;
                  RECEIVER.changeChannel();
                  RECEIVER.channel_modal.show('name');                  
                } else {
                  RECEIVER.channel = '';
                  RECEIVER.call_back = false;
                  UI.notify('No channel directories in user workspace');
                }
              } catch(err) {
                console.log('Receiver cannot parse JSON:', err, data.slice(0, 250));
                UI.alert('Invalid channel list');
              }
            }
          });
    }
  }
  
  changeChannel() {
    // Update the call-back checkbox and label.
    const
        si = this.selector.selectedIndex,
        cb = (si >= 0 && this.channel_list[si].callback);
    if(cb) {
      this.call_back_box.classList.remove('disab');
      this.call_back_label.classList.remove('lbl-disab');
    } else {
      this.call_back_box.classList.add('disab');
      this.call_back_label.classList.add('lbl-disab');
    }
  }
  
  listen() {
    // If active, check with local server whether there is a new command.
    if(!this.active) return;
    fetch('receiver/', postData({channel: this.channel, action: 'listen'}))
      .then(UI.fetchText)
      .then((data) => {
          let jsr = {},
              msg = '';
          if(!UI.postResponseOK(data)) {
            msg = 'Receiver issue: ' + data;
          } else {
            try {
              jsr = JSON.parse(data);
            } catch(err) {
              console.log('Receiver cannot parse JSON:', err, data.slice(0, 250));
              msg = 'Invalid JSON command string';
            }
          }
          if(!msg) {
            // (Re)define the prefix to be added to the report names.
            // NOTE: Sanitize the string so it cannot alter the directory path.
            RECEIVER.report_prefix = FILE_MANAGER.asFilePath(jsr.prefix || ''); 
            if(jsr.stop === true) {
              UI.notify('Receiver deactivated by command');
              RECEIVER.deactivate();
            } else {
              // Attempt actions specified by the JSON command.
              // First: try to load new model (if specified).
              if(jsr.xml) {
                if(!UI.loadModelFromXML(jsr.xml)) {
                  msg = 'Received model is not valid';
                }
              }
              // Then modify model settings (if specified).
              if(!msg && jsr.settings) {
console.log('HERE settings', jsr.settings);
                // NOTE: Any issues will be reported by the model.
                MODEL.parseSettings(jsr.settings);
              }
              // Then add/update datasets (if specified).
              if(!msg && jsr.datasets) {
console.log('HERE datasets', jsr.datasets);
                // NOTE: Any issues will be reported by the Dataset manager.
                DATASET_MANAGER.readCSVData(jsr.datasets);
              }
              // Then modify model parameters (if specified).
              if(!msg && jsr.attributes) {
console.log('HERE attributes', jsr.attributes);
                const issues = MODEL.setEntityAttributes(jsr.attributes);
                if(issues.length) {
                  const lines = ' - ' + issues.join('\n - ');
                  UI.warn(pluralS(issues.length, 'problem') +
                      ' while setting attribute values');
                  console.log(lines);
                  RECEIVER.log_lines.push(lines);
                }
              }
              // If command also specifies an experiment, check whether
              // it is defined in the model.
              if(!msg && jsr.experiment) {
                EXPERIMENT_MANAGER.selectExperiment(jsr.experiment);
                if(!EXPERIMENT_MANAGER.selected_experiment) {
                  msg = `Received experiment "${jsr.experiment}" is unknown`;
                } else {
                  RECEIVER.experiment = jsr.experiment;
                }
              }
              if(!msg && jsr.run) {
                // NOTE: Virtual Machine will trigger the receiver's reporting
                // action each time the model has been solved.
                if(RECEIVER.experiment) {
                  RECEIVER.log('Starting experiment: ' + RECEIVER.experiment);
                  EXPERIMENT_MANAGER.startExperiment();
                } else {
                  VM.solveModel();
                }                
              }
              // On error, the receiver should stop listening, and the error
              // causing this abort should be reported by the local host server.
              if(msg) {
                RECEIVER.setError(msg);
                // Record abort on local host.
                fetch('receiver/', postData({
                      channel: RECEIVER.channel,
                      action: 'abort',
                      log: RECEIVER.logReport
                    }))
                  .then(UI.fetchText)
                  .then((data) => {
                      // Always show response on status line.
                      UI.postResponseOK(data, true);
                      // Keep listening, so check again after the time interval.
                      setTimeout(() => RECEIVER.listen(), RECEIVER.interval);
                    })
                  .catch(UI.fetchCatch);
              } else {
                // Keep listening, so check again after the time interval.
                setTimeout(() => RECEIVER.listen(), RECEIVER.interval);
              }
            }
          }
          if(msg) RECEIVER.setError(msg);
        })
      .catch(UI.fetchCatch);
  }

  report() {
    // Post the run results to the local server, or signal an error.
    // NOTE: Always set `solving` to FALSE.
    this.solving = false;
    let form,
        file = this.report_prefix,
        run = '',
        channel = this.channel;
    if(!this.active) {
      // NOTE: If receiver is not active, empty channel name informs the
      // server that reports should be saved in user/reports.
      channel = '';
      // NOTE: The @ will be replaced by the run number, so that that
      // number precedes the clock time. The @ will be unique because
      // `asFilePath(...)` replaces special characters by underscores. 
      file = FILE_MANAGER.asFilePath(MODEL.name || 'model') +
          '@-' + compactClockTime();
    }
    // NOTE: When reporting while the receiver is not active, report the
    // results of the running experiment.
    if(this.experiment || !this.active) {
      if(MODEL.running_experiment) {
        run = MODEL.running_experiment.active_combination_index;
        this.log(`Reporting: ${file} (run #${run})`);
      }
    }
    if(MODEL.solved && !VM.halted) {
      // Normal execution termination => report results.
      const od = MODEL.outputData;
      form = {
          channel: channel,
          file: file,
          action: 'report',
          run: run,
          data: od[0],
          stats: od[1],
          log: RECEIVER.logReport
        };
    } else {
      if(!VM.halted && !this.error) {
        // No apparent cause => log this irregularity.
        this.setError('ERROR: Unknown solver problem');
      }
      form = {
          channel: this.channel,
          action: 'abort',
          log: this.logReport
        };
    }
    fetch('receiver/', postData(form))
      .then(UI.fetchText)
      .then((data) => {
          // For experiments, only display server response if warning or error.
          UI.postResponseOK(data, !RECEIVER.experiment);
          // If execution completed, perform the call-back action if the
          // receiver is active (so not when auto-reporting a run) and
          // call-back is permitted by the modeler.
          // NOTE: For experiments, call-back is performed upon completion by
          // the Virtual Machine.
          if(RECEIVER.active && RECEIVER.call_back && !RECEIVER.experiment) {
            RECEIVER.callBack();
          }
        })
      .catch(UI.fetchCatch);
  }

  callBack() {
    // When permitted by the modeler, request the local server to execute
    // the channel's call-back command.
    if(!this.call_back) return;
    fetch('receiver/', postData({
          channel: this.channel,
          action: 'call-back'
        }))
      .then(UI.fetchText)
      .then((data) => {
          // Call-back completed => resume listening unless running experiment.
          if(RECEIVER.experiment) {
            // For experiments, only display server response if warning or error.
            UI.postResponseOK(data);
          } else {
            // Always show server response for single runs.
            if(UI.postResponseOK(data, true)) {
              // NOTE: Resume listening only if no error.
              setTimeout(() => RECEIVER.listen(), RECEIVER.interval);
            } else {
              RECEIVER.deactivate();
            }
          }
        })
      .catch(UI.fetchCatch);
  }

} // END of class GUIReceiver
