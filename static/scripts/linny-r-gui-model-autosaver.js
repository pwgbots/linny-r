/*
Linny-R is an executable graphical specification language for (mixed integer)
linear programming (MILP) problems, especially unit commitment problems (UCP).
The Linny-R language and tool have been developed by Pieter Bots at Delft
University of Technology, starting in 2009. The project to develop a browser-
based version started in 2017. See https://linny-r.org for more information.

This JavaScript file (linny-r-gui.js) provides the GUI functionality
for the Linny-R model editor: buttons on the main tool bars, the associated
dialogs, the main drawing canvas, and event handler functions.

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

// CLASS ModelAutoSaver automatically saves the current model at regular
// time intervals in the user's `autosave` directory.
class ModelAutoSaver {
  constructor() {
    // Keep track of time-out interval of auto-saving feature.
    this.timeout_id = 0;
    this.interval = 10; // auto-save every 10 minutes
    this.period = 24; // delete models older than 24 hours
    this.model_list = [];
    // Overwite defaults if settings still in local storage of browser.
    this.getSettings();
    // Purge files that have "expired".
    this.getAutoSavedModels();
    // Start the interval timer.
    this.setAutoSaveInterval();
    // Add listeners to GUI elements.
    this.confirm_dialog = document.getElementById('confirm-remove-models');
    document.getElementById('auto-save-clear-btn').addEventListener('click',
        () => AUTO_SAVE.confirm_dialog.style.display = 'block');
    document.getElementById('autosave-do-remove').addEventListener('click',
        // NOTE: File name parameter /*ALL*/ indicates: delete all.
        () => AUTO_SAVE.getAutoSavedModels(true, '/*ALL*/'));
    document.getElementById('autosave-cancel').addEventListener('click',
        () => AUTO_SAVE.confirm_dialog.style.display = 'none');
    document.getElementById('restore-cancel').addEventListener('click',
        () => AUTO_SAVE.hideRestoreDialog(false));
    document.getElementById('restore-confirm').addEventListener('click',
        () => AUTO_SAVE.hideRestoreDialog(true));
  }
  
  getSettings() {
    // Reads custom auto-save settings from local storage.
    try {
      const item = window.localStorage.getItem('Linny-R-autosave');
      if(item) {
        const
            mh = item.split('|'),
            m = parseFloat(mh[0]),
            h = parseFloat(mh[1]);
        if(isNaN(m) || isNaN(h)) {
          UI.warn('Ignored invalid local auto-save settings');
        } else {
          this.interval = m;
          this.period = h;
        }
      }
    } catch(err) {
      console.log('Local storage failed:', err);
    }  
  }
  
  setSettings() {
    // Writes custom auto-save settings to local storage.
    try {
      window.localStorage.setItem('Linny-R-autosave',
          this.interval + '|' + this.period);
      UI.notify('New auto-save settings stored in browser');
    } catch(err) {
      UI.warn('Failed to write auto-save settings to local storage');
      console.log(err);
    }  
  }
  
  saveModel() {
    document.getElementById('autosave-btn').classList.add('stay-activ');
    // Use setTimeout to let browser always briefly show the active color
    // even when the model file is small and storing hardly takes time.
    setTimeout(() => FILE_MANAGER.storeAutoSavedModel(), 300);
  }
  
  setAutoSaveInterval() {
    // Activate the auto-save feature (if interval is configured).
    if(this.timeout_id) clearInterval(this.timeout_id);
    // NOTE: Interval = 0 indicates "do not auto-save".
    if(this.interval) {
      // Interval is in minutes, so multiply by 60 thousand to get msec.
      this.timeout_id = setInterval(
          () => AUTO_SAVE.saveModel(), this.interval * 60000);
    }
  }

  getAutoSavedModels(show_dialog=false, file_to_delete='') {
    // Get list of auto-saved models from server (after deleting those that
    // have been stored beyond the set period AND the specified file to
    // delete (where /*ALL*/ indicates "delete all auto-saved files").
    const pd = {action: 'purge', period: this.period};
    if(file_to_delete) pd.to_delete = file_to_delete;
    fetch('autosave/', postData(pd))
      .then((response) => {
          if(!response.ok) {
            UI.alert(`ERROR ${response.status}: ${response.statusText}`);
          }
          return response.text();
        })
      .then((data) => {
          if(UI.postResponseOK(data)) {
            try {
              AUTO_SAVE.model_list = JSON.parse(data);
            } catch(err) {
              AUTO_SAVE.model_list = [];
              UI.warn('Data on auto-saved models is not valid');
            }
          }
          // Update auto-save-related dialog elements.
          const
              n = this.model_list.length,
              ttl = pluralS(n, 'auto-saved model'),
              rbtn = document.getElementById('load-autosaved-btn');
          document.getElementById('autosave-btn').title = ttl;
          rbtn.title = ttl;
          rbtn.style.display = (n > 0 ? 'block' : 'none');
          if(show_dialog) AUTO_SAVE.showRestoreDialog();
        })
      .catch((err) => {console.log(err); UI.warn(UI.WARNING.NO_CONNECTION, err);});
  }

  showRestoreDialog() {
    // Shows list of auto-saved models; clicking on one will load it
    // NOTE: hide "Load model" dialog in case it was showing.
    document.getElementById('load-modal').style.display = 'none';
    // Contruct the table to select from.
    let html = '';
    for(let i = 0; i < this.model_list.length; i++) {
      const
          m = this.model_list[i],
          bytes = UI.sizeInBytes(m.size).split(' ');
      html += ['<tr class="dataset" style="color: gray" ',
          'onclick="FILE_MANAGER.loadAutoSavedModel(\'',
          m.name,'\');"><td class="restore-name">', m.name, '</td><td>',
          m.date.substring(1, 16).replace('T', ' '),
          '</td><td style="text-align: right">',
          bytes[0], '</td><td>', bytes[1], '</td><td style="width:15px">',
          '<img class="del-asm-btn" src="images/delete.png" ',
          'onclick="event.stopPropagation(); ',
          'AUTO_SAVE.getAutoSavedModels(true, \'', m.name,
          '\')"></td></tr>'].join('');
    }
    document.getElementById('restore-table').innerHTML = html;
    // Adjust dialog height (max-height will limit list to 10 lines).
    document.getElementById('restore-dlg').style.height =
        (48 + 19 * this.model_list.length) + 'px';
    document.getElementById('confirm-remove-models').style.display = 'none';
    // Fill text input fields with present settings.
    document.getElementById('auto-save-minutes').value = this.interval;
    document.getElementById('auto-save-hours').value = this.period;
    // Show remove button only if restorable files exits.
    const
      ttl = document.getElementById('restore-dlg-title'),
      sa = document.getElementById('restore-scroll-area'),
      btn = document.getElementById('auto-save-clear-btn');
    if(this.model_list.length) {
      ttl.innerHTML = 'Restore auto-saved model';
      sa.style.display = 'block';
      btn.style.display = 'block';
    } else {
      ttl.innerHTML = 'Auto-save settings (for this browser)';
      sa.style.display = 'none';
      btn.style.display = 'none';
    }
    document.getElementById('restore-modal').style.display = 'block';
  }
  
  hideRestoreDialog(save=true) {
    // Close the restore auto-save model dialog.
    document.getElementById('confirm-remove-models').style.display = 'none';
    // NOTE: Cancel button or ESC will pass `cancel` as FALSE => do not save.
    if(!save) {
      document.getElementById('restore-modal').style.display = 'none';
      return;
    }
    // Validate settings.
    let m = this.interval,
        h = this.period,
        e = document.getElementById('auto-save-minutes');
    m = parseInt(e.value);
    if(!isNaN(m)) {
      e = document.getElementById('auto-save-hours');
      h = parseInt(e.value);
      if(!isNaN(h)) {
        // If valid, store in local storage of browser.
        if(m !== this.interval || h !== this.period) {
          this.interval = m;
          this.period = h;
          this.setSettings();
          this.setAutoSaveInterval();
        }
        document.getElementById('restore-modal').style.display = 'none';
        return;
      }
    }
    UI.warn('Invalid auto-save settings');
    e.focus();
  }

} // END of class ModelAutoSaver
