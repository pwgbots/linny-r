/*
Linny-R is an executable graphical specification language for (mixed integer)
linear programming (MILP) problems, especially unit commitment problems (UCP).
The Linny-R language and tool have been developed by Pieter Bots at Delft
University of Technology, starting in 2009. The project to develop a browser-
based version started in 2017. See https://linny-r.org for more information.

This JavaScript file (linny-r-gui-file-manager.js) provides the GUI
functionality for the Linny-R File Manager.

*/

/*
Copyright (c) 2017-2023 Delft University of Technology

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

// CLASS GUIFileManager provides the GUI for loading and saving models and
// diagrams and handles the interaction with the MILP solver via POST requests
// to the server.
// NOTE: Because the console-only monitor requires Node.js modules, this
// GUI class does NOT extend its console-only counterpart.


// CLASS GUIFileManager
class GUIFileManager {

  // NOTE: The modal dialogs related to loading and saving a model file
  // are properties of the GUIController because they are activated by
  // buttons on the top menu.

  getRemoteData(dataset, url) {
    // Gets data from a URL, or from a file on the local host 
    if(url === '') return;
    // NOTE: add this dataset to the "loading" list...
    addDistinct(dataset, MODEL.loading_datasets);
    // ... and allow for 3 more seconds (6 times 500 ms) to complete
    MODEL.max_time_to_load += 6;
    // Send the "load data" request to the server
    fetch('load-data/', postData({'url': url}))
      .then((response) => {
          if(!response.ok) {
            UI.alert(`ERROR ${response.status}: ${response.statusText}`);
          }
          return response.text();
        })
      .then((data) => {
          if(data !== '' && UI.postResponseOK(data)) {
            if(dataset instanceof BoundLine) {
              // Server must return semicolon-separated list of white-
              // space-separated list of numbers.
              dataset.unpackPointDataString(data);
              dataset.points_string = dataset.pointDataString;
              // Show data in boundline data modal when it is visible.
              if(!UI.hidden('boundline-data-modal')) {
                CONSTRAINT_EDITOR.stopEditing(false);
              }
            } else {
              // Server must return either semicolon-separated or
              // newline-separated string of numbers
              if(data.indexOf(';') < 0) {
                // If no semicolon found, replace newlines by semicolons
                data = data.trim().split('\n').join(';');
              }
              // Remove all white space
              data = data.replace(/\s+/g, '');
              // Show data in text area when the SERIES dialog is visible
              if(!UI.hidden('series-modal')) {
                DATASET_MANAGER.series_data.value = data.split(';').join('\n');
              } else {
                dataset.unpackDataString(data);
              }
            }
            // NOTE: remove dataset from the "loading" list
            const i = MODEL.loading_datasets.indexOf(dataset);
            if(i >= 0) MODEL.loading_datasets.splice(i, 1);
          }
        })
      .catch((err) => UI.warn(UI.WARNING.NO_CONNECTION, err));
  }

  decryptIfNeeded(event, action) {
    // Checks whether XML is encrypted; if not, processes data "as is", otherwise
    // prompts for password
    const data = event.target.result;
    if(data.indexOf('model latch="') < 0) return action(data);
    const
        xml = parseXML(data),
        md = UI.modals.password;
    md.encrypted_msg = {
        encryption: nodeContentByTag(xml, 'content'),
        latch: nodeParameterValue(xml, 'latch')
      };
    md.post_decrypt_action = action;
    md.element('action').innerHTML = 'Enter';
    md.ok = UI.removeListeners(md.ok);
    md.ok.addEventListener('click', () => FILE_MANAGER.startToDecrypt());
    this.updateStrength();
    md.show('code');
  }
  
  startToDecrypt() {
    // Wrapper function to permit DOM events to occur first
    const
        md = UI.modals.password,
        encr_msg = md.encrypted_msg,
        code = md.element('code'),
        password = code.value;
    // NOTE: immediately clear password field
    code.value = '';
    md.hide();
    UI.waitingCursor();
    UI.setMessage('Decrypting...');
    // NOTE: asynchronous function tryToDecrypt is defined in linny-r-utils.js
    setTimeout((msg, pwd, ok, err) => tryToDecrypt(msg, pwd, ok, err), 5,
        encr_msg, password,
        // The on_ok function
        (data) => {
            UI.normalCursor();
            const md = UI.modals.password;
            if(data) md.post_decrypt_action(data);
            md.encrypted_msg = null;
            md.post_decrypt_action = null;
          },
        // The on_error function
        (err) => {
            console.log(err);
            UI.warn('Failed to load encrypted model');
            const md = UI.modals.password;
            md.encrypted_msg = null;
            md.post_decrypt_action = null;
          });
  }
  
  readModel(event) {
    // Read XML string from input file, decrypt if necessary, and then parse it
    this.decryptIfNeeded(event, (data) => UI.loadModelFromXML(data));
  }  
  
  loadModel() {
    // Get the XML of the file selected in the Load dialog
    const md = UI.modals.load;
    md.hide();
    try {
      const file = md.element('xml-file').files[0];
      if(!file) return;
      if(file.name.split('.').pop() != 'lnr') {
        UI.warn('Linny-R files should have extension .lnr');
      }
      const reader = new FileReader();
      reader.onload = (event) => FILE_MANAGER.readModel(event);
      reader.readAsText(file);
    } catch(err) {
      UI.alert('Error while reading file: ' + err);
    }
  }

  promptToLoad() {
    // Show "Load model" modal
    // @@TO DO: warn user if unsaved changes to current model
    UI.hideStayOnTopDialogs();
    // Update auto-saved model list; if not empty, this will display the
    // "restore autosaved files" button
    AUTO_SAVE.getAutoSavedModels();
    // Show the "Load model" dialog
    UI.modals.load.show();
  }

  readModelToCompare(event) {
    // Read model-to-compare from input file, decrypting if necessary
    this.decryptIfNeeded(event,
        (data) => DOCUMENTATION_MANAGER.compareModels(data));
  }  
  
  loadModelToCompare() {
    document.getElementById('comparison-modal').style.display = 'none';
    try {
      const file = document.getElementById('comparison-xml-file').files[0];
      if(!file) return;
      if(file.name.split('.').pop() != 'lnr') {
        UI.warn('Linny-R files should have extension .lnr');
      }
      const reader = new FileReader();
      reader.onload = (event) => FILE_MANAGER.readModelToCompare(event);
      reader.readAsText(file);
    } catch(err) {
      UI.alert('Error while reading file: ' + err);
    }
  }
  
  passwordStrength(pwd) {
    if(pwd.length < CONFIGURATION.min_password_length) return 0;
    let score = 1;
    if(pwd.match(/[a-z]/) && pwd.match(/[A-Z]/)) score++;
    if(pwd.match(/\d+/)) score++;
    if(pwd.match(/.[!,@,#,$,%,^,&,*,?,_,~,-,(,)]/)) score++;
    if(pwd.length > CONFIGURATION.min_password_length + 4) score++;
    return score;
  }
  
  updateStrength() {
    // Relects password strength in password field colors
    const code = document.getElementById('password-code');
    if(document.getElementById('password-action').innerHTML === 'Set') {
      code.className = 'pws-' + this.passwordStrength(code.value);
    } else {
      code.className = '';
    }
  }
  
  confirmPassword() {
    const
        md = UI.modals.password,
        code = md.element('code');
    md.encryption_code = code.value;
    // NOTE: immediately clear password field
    code.value = '';
    if(md.encryption_code.length < CONFIGURATION.min_password_length) {
      UI.warn('Password must be at least '+ CONFIGURATION.min_password_length +
          ' characters long');
      md.encryption_code = '';
      code.focus();
      return;
    }
    md.element('action').innerHTML = 'Confirm';
    md.ok = UI.removeListeners(md.ok);
    md.ok.addEventListener('click', () => FILE_MANAGER.encryptModel());
    this.updateStrength();
    code.focus();
  }
  
  saveModel() {
    MODEL.clearSelection();
    if(MODEL.encrypt) {
      const md = UI.modals.password;
      md.encryption_code = '';
      md.element('action').innerHTML = 'Set';
      md.ok = UI.removeListeners(md.ok);
      md.ok.addEventListener('click', () => FILE_MANAGER.confirmPassword());
      this.updateStrength();
      md.show('code');
      return;
    }
    // NOTE: Encode hashtags, or they will break the URI.
    this.pushModelToBrowser(MODEL.asXML.replace(/#/g, '%23'));
  }
  
  pushModelToBrowser(xml) {
    UI.setMessage('Model file size: ' + UI.sizeInBytes(xml.length));
    const el = document.getElementById('xml-saver');
    el.href = 'data:attachment/text,' + encodeURI(xml);
    console.log('Encoded file size:', el.href.length);
    el.download = 'model.lnr';
    if(el.href.length > 25*1024*1024 &&
        navigator.userAgent.search('Chrome') <= 0) {
      UI.notify('Model file size exceeds 25 MB. ' +
          'If it does not download, store it in a repository');
    }
    el.click();
    UI.normalCursor();
  }
  
  encryptModel() {
    const
        md = UI.modals.password,
        code = md.element('code'),
        pwd = code.value;
    // NOTE: immediately clear password field
    code.value = '';
    md.hide();
    if(pwd !== md.encryption_code) {
      UI.warn('Encryption passwords did not match');
      return;
    }
    UI.setMessage('Encrypting...');
    UI.waitingCursor();
    // Wait for key (NOTE: asynchronous functions defined in linny-r.js)
    encryptionKey(pwd)
      .then((key) => encryptMessage(MODEL.asXML.replace(/#/g, '%23'), key)
          .then((enc) => this.pushModelToBrowser(MODEL.asEncryptedXML(enc)))
          .catch((err) => {
              UI.alert('Encryption failed');
              console.log(err);
            }))
      .catch((err) => {
          UI.alert('Failed to get encryption key');
          console.log(err);
        });
  }

  loadAutoSavedModel(name) {  
    fetch('autosave/', postData({
          action: 'load',
          file: name
        }))
      .then((response) => {
          if(!response.ok) {
            UI.alert(`ERROR ${response.status}: ${response.statusText}`);
          }
          return response.text();
        })
      .then((data) => {
          if(UI.postResponseOK(data)) UI.loadModelFromXML(data);
        })
      .catch((err) => UI.warn(UI.WARNING.NO_CONNECTION, err));
  }

  storeAutoSavedModel() {
    // Stores the current model in the local auto-save directory
    const bcl = document.getElementById('autosave-btn').classList;
    if(MODEL.running_experiment) {
      console.log('No autosaving while running an experiment');
      bcl.remove('stay-activ');
      return;
    }
    fetch('autosave/', postData({
          action: 'store',
          file: REPOSITORY_BROWSER.asFileName(
              (MODEL.name || 'no-name') + '_by_' +
                  (MODEL.author || 'no-author')),
          xml: MODEL.asXML
        }))
      .then((response) => {
          if(!response.ok) {
            UI.alert(`ERROR ${response.status}: ${response.statusText}`);
          }
          return response.text();
        })
      .then((data) => {
          if(!UI.postResponseOK(data) && data.indexOf('not implemented') >= 0) {
            // Switch off auto-save when server does not implement it.
            AUTO_SAVE.interval = 0;
            AUTO_SAVE.not_implemented = true;
            console.log('Auto-save disabled');
          }
          bcl.remove('stay-activ');
        })
      .catch((err) => {
          UI.warn(UI.WARNING.NO_CONNECTION, err);
          bcl.remove('stay-activ');
        });
  }

  renderDiagramAsPNG(tight) {
    // When `tight` is TRUE, add no whitespace around the diagram.
    window.localStorage.removeItem('png-url');
    if(tight) {
      // First align to grid and then fit to size.
      MODEL.alignToGrid();      
      UI.paper.fitToSize(1);
    } else {
      UI.paper.fitToSize();
      MODEL.alignToGrid();      
    }
    this.renderSVGAsPNG(UI.paper.opaqueSVG);
  }
  
  renderSVGAsPNG(svg) {
    // Sends SVG to the server, which will convert it to PNG using Inkscape;
    // if successful, the server will return the URL to the PNG file location;
    // this URL is passed via the browser's local storage to the newly opened
    // browser tab that awaits this URL and then loads it
    const form = {
            action: 'png',
            user: VM.solver_user,
            token: VM.solver_token,
            data: btoa(encodeURI(svg))
          };
    fetch('solver/', postData(form))
      .then((response) => {
          if(!response.ok) {
            UI.alert(`ERROR ${response.status}: ${response.statusText}`);
          }
          return response.text();
        })
      .then((data) => {
          // Pass URL of image to the newly opened browser window
          window.localStorage.setItem('png-url', data);
        })
      .catch((err) => UI.warn(UI.WARNING.NO_CONNECTION, err));
  }
  
  saveDiagramAsSVG(tight) {
    // Output SVG as string with nodes and arrows 100% opaque.
    if(tight) {
      // First align to grid and then fit to size.
      MODEL.alignToGrid();      
      UI.paper.fitToSize(1);
    } else {
      UI.paper.fitToSize();
      MODEL.alignToGrid();      
    }
    this.pushOutSVG(UI.paper.opaqueSVG);
  }
  
  pushOutSVG(svg) {
    const blob = new Blob([svg], {'type': 'image/svg+xml'});
    const e = document.getElementById('svg-saver');
    e.download = 'model.svg';
    e.type = 'image/svg+xml';
    e.href = (window.URL || webkitURL).createObjectURL(blob);
    e.click();
  }  
 
} // END of class GUIFileManager
