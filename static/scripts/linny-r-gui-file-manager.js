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

// CLASS GUIFileManager provides the GUI for loading and saving models and
// diagrams and handles the interaction with the MILP solver via POST requests
// to the server.
// NOTE: Because the console-only monitor requires Node.js modules, this
// GUI class does NOT extend its console-only counterpart.

// CLASS GUIFileManager
class GUIFileManager {
  constructor() {
    // Use `md` as shorthand for the "Load/Save" modal dialog.
    // NOTE: File manager is instantiated *after* the Controller, so the
    // file browser modal has already been created.
    const md = UI.modals.browser;
    this.modal = md;
    UI.resizableDialog('browser');
    // However, all its components still need to be initialized.
    this.dir_table = md.element('dir-table');
    this.model_table = md.element('model-table');
    this.model_sa = md.element('model-scroll-area');
    this.system_btn = md.element('system-btn');
    this.delete_btn = md.element('delete-btn');
    this.resizer = md.element('resize');
    // Root dir object will be fetched from server.
    this.root_dirs = {};
    // Same holds for path separator -- assume '/'.
    this.separator = '/';
    // List of directories is updated each tim the dir table is refreshed.
    this.dir_list = [];
    this.selected_dir = null;
    this.focal_table = null;
    this.clicked_row = null;
    // Keep list of only the model files in the selected directory.
    this.models = [];
    // Index of selected model (-1 if none selected).
    this.model_index = -1;
    // Number of sub-directories in the selected directory
    // (shown as the first rows of the models table)
    this.sd_count = 0;
    // File name (without '.lnr') from which XML data has been read.
    this.model_file_name = '';
    // List of included models (inferred from clusters in current model).
    this.included_modules = [];
    // Model object to compare current model with.
    this.model_B = null;
    // The action to perform when OK is clicked model selected
    this.action = 'load';
    this.download_via_browser = false;

    // Add event listeners to elements.
    md.ok.addEventListener('click',
        () => FILE_MANAGER.enterKey());
    md.cancel.addEventListener('click',
        () => FILE_MANAGER.modal.hide());
    this.system_btn.addEventListener('click',
        () => FILE_MANAGER.showUploadModal());
    md.element('download-btn').addEventListener('click',
        () => FILE_MANAGER.saveModel({altKey: true}));
    this.delete_btn.addEventListener('click',
        () => FILE_MANAGER.confirm_delete_modal.show());
    md.element('autosave-btn').addEventListener('click',
        () => FILE_MANAGER.showAutoSaveDialog());

    // Add modal dialogs.
    this.upload_modal = new ModalDialog('upload');
    this.upload_modal.ok.addEventListener('click',
        () => FILE_MANAGER.uploadModelViaBrowser());
    this.upload_modal.cancel.addEventListener('click',
        () => FILE_MANAGER.upload_modal.hide());

    this.include_modal = new ModalDialog('include');
    this.include_modal.ok.addEventListener(
        'click', () => FILE_MANAGER.performInclusion());
    this.include_modal.cancel.addEventListener(
        'click', () => FILE_MANAGER.cancelInclusion());
    this.include_modal.element('prefix').addEventListener(
        'blur', () => FILE_MANAGER.suggestBindings());
    this.include_modal.element('actor').addEventListener(
        'blur', () => FILE_MANAGER.updateActors());

    this.update_modal = new ModalDialog('update');
    this.update_modal.ok.addEventListener(
        'click', () => FILE_MANAGER.performUpdate());
    this.update_modal.cancel.addEventListener(
        'click', () => FILE_MANAGER.cancelUpdate());
    this.update_modal.element('module').addEventListener(
        'change', () => FILE_MANAGER.checkUpdateBindings());

    this.confirm_load_modal = new ModalDialog('confirm-load-model');
    this.confirm_load_modal.follow_up = null;
    this.confirm_load_modal.ok.addEventListener(
        'click', () => {
            const md = FILE_MANAGER.confirm_load_modal;
            md.hide(); 
            if(typeof md.follow_up === 'function') {
              md.follow_up();
              md.follow_up = null;
            }
          });
    this.confirm_load_modal.cancel.addEventListener(
        'click', () => {
            const md = FILE_MANAGER.confirm_load_modal;
            md.hide(); 
            md.follow_up = null;
          });

    this.confirm_delete_modal = new ModalDialog('confirm-delete-model');
    this.confirm_delete_modal.ok.addEventListener(
        'click', () => FILE_MANAGER.deleteModel());
    this.confirm_delete_modal.cancel.addEventListener(
        'click', () => FILE_MANAGER.confirm_delete_modal.hide());
    
    this.autosave_modal = new ModalDialog('autosave');
    this.autosave_modal.ok.addEventListener(
        'click', () => FILE_MANAGER.updateAutoSaveSettings());
    this.autosave_modal.cancel.addEventListener(
        'click', () => FILE_MANAGER.autosave_modal.hide());
    
    // Get path and sub-directories of each root location.
    this.getRootData();
    // Keep track of time-out interval of auto-saving feature.
    this.autosave_timeout_id = 0;
  }
  
  updatePath() {
    // Update path of selected directory or model file (if any) as
    // displayed on status line.
    const
        icon = this.modal.element('root-img'),
        path_div = this.modal.element('path');
    let path = '',
        png = 'home';
    if(this.selected_dir) {
      // Update the root icon.
      png = this.selected_dir.root;
      if(png === 'autosave') png += '-folder';
      icon.src = `images/${png}.png`;
      icon.classList.remove('off');
      const
          sd_root = this.selected_dir.root,
          sd_path = this.selected_dir.path;
      // Update the path.
      path = '<em>(Linny-R)</em>' + this.separator + 'user';
      if(sd_root === 'github') {
        path = 'linny-r-models' + sd_path + '/';
        path_div.style.color = '#400080';
      } else {
        if(sd_root === 'download') {
          path = '<em>Downloads</em>';
        } else if(sd_root === 'home') {
          path += this.separator + 'models';
        } else {
          path += this.separator + 'autosave';          
        }
        if(sd_path) path += this.separator + sd_path;
        path_div.style.color = 'Black';
      }
      const mi = this.model_index;
      if(mi >= 0) {
        path += this.separator;
        if(mi < this.sd_count) {
          path += this.selected_dir.subdirs[mi].name;
        } else {
          path += this.selected_dir.models[mi - this.sd_count].name + '.lnr';
        }
      }
    } else {
      icon.classList.add('off');
    }
    path_div.innerHTML = path;
  }
  
  getRootData() {
    // Request data on root directories from local host.
    fetch('browse/', postData({action: 'roots'}))
      .then(UI.fetchText)
      .then((data) => {
          if(data && UI.postResponseOK(data)) {
            let roots;
            try {
              roots = JSON.parse(data);
            } catch(err) {
              roots = {};
              UI.alert('File browser failed to get root data', err);
            }
            // The 'roots' request returns data on the three local
            // directories (models, autosave and downloads).
            FILE_MANAGER.root_dirs = roots;
            FILE_MANAGER.selected_dir = roots.home;
            // The GitHub directory requires a seperate FETCH request.
            FILE_MANAGER.getGitHubDirs();
          }
        })
      .catch(UI.fetchCatch);    
  }
  
  getGitHubDirs() {
    // Get the complete Linny-R models directory on GitHub.
    // NOTE: Execute this call only once per Linny-R session, as GitHub
    // has a rate limit of 60 requests per hour.
    fetch('browse/', postData({action: 'github'}))
      .then(UI.fetchText)
      .then((data) => {
          if(data && UI.postResponseOK(data)) {
            try {
              const dir_info = JSON.parse(data);
              FILE_MANAGER.root_dirs.github = dir_info;
            } catch(err) {
              UI.warn('Invalid data from GitHub website');
            }
          }
        })
      .catch(UI.fetchCatch);
  }
  
  showDialog(action='load') {
    // Show file browser dialog, configured for the specified action.
    this.action = action;
    this.focal_table = this.dir_table;
    this.selected_dir = this.root_dirs.home || null;
    if(this.action === 'load') {
      // Prompt the modeler to confirm discarding unsaved changes, if any.
      const md = this.confirm_load_modal;
      if(!md.follow_up && !UNDO_STACK.empty) {
        md.follow_up = () => FILE_MANAGER.showDialog('load');
        md.show();
        return;
      } else {
        // Reset the confirmation modal (just to make sure).
        md.follow_up = null;        
      }
    }
    const md = this.modal;
    if(this.action === 'include') {
      md.element('action').innerText = 'Select model to include in current model';
    } else if(this.action === 'update') {
      md.element('action').innerText = 'Select model to update included clusters';
    } else if(this.action === 'compare') {
      md.element('action').innerText = 'Select model B to compare with current model A';
    } else {
      md.element('action').innerText = 'Load model';
    }
    this.updateDirectoryTable();
    this.updateModelTable();
    this.updateButtons();
    this.updatePath();
    this.last_time_clicked = 0;
    md.show();
  }
  
  updateButtons() {
    this.delete_btn.classList.add('off');
    if(this.selected_dir && this.model_index >= this.sd_count) {
      this.modal.ok.classList.remove('disab');
      if(this.selected_dir.root === 'home') {
        this.delete_btn.classList.remove('off');
      }
    } else {
      this.modal.ok.classList.add('disab');
    }
  }
  
  addDirRow(d, rows, level, icon) {
    // Recursively add directories to the dir tree.
    const
        sel = (d === this.selected_dir ? ' sel-set' : ''),
        index = rows.length;
    rows.push(['<tr id="brdir-', index, '" class="module', sel,
        '" title="', pluralS(d.mcount, 'model'),
        '" onclick="FILE_MANAGER.selectDir(event, ', index, ')"><td>',
        '<div class="dir', (d.subdirs.length ? '' : '-no'),
        '-btn" style="margin-left: ', level * 14,
        'px" onclick="FILE_MANAGER.toggleDir(event, ', index, ')">',
        // Triangle pointing down or right.
        (d.open ? '\u25BC' : '\u25BA'),
        '</div><img class="dir-icon" src="images/',
        icon, (level && d.open ? '-open' : ''), '.png">',
        '<div class="dir-name">', d.name, '</div></td></tr>'].join(''));
    this.dir_list.push(d);
    if(d.open) {
      for(const sd of d.subdirs) {
        this.addDirRow(sd, rows, level + 1, 'folder');
      }
    }
  }
  
  updateDirectoryTable() {
    // Update the HTML contents of the directry table.
    this.dir_list.length = 0;
    const rows = [];
    for(const k of Object.keys(this.root_dirs)) {
      this.addDirRow(this.root_dirs[k], rows, 0,
          (k === 'autosave' ? k + '-folder' : k));
    }
    this.dir_table.innerHTML = rows.join('');
  }
  
  updateModelTable() {
    // Refresh the models table.
    const rows = [];
    if(this.selected_dir) {
      const
          sdl = this.selected_dir.subdirs,
          ml = this.selected_dir.models;
      let index = 0;
      for(const sd of sdl) {
        const sel = (index === this.model_index ? ' sel-set' : '');
        rows.push('<tr id="dir-entry-', index, '" class="module', sel,
            '" title="', pluralS(sd.mcount, 'model'),
            '" onclick="FILE_MANAGER.selectEntry(event, ', index,
            ');" ><td colspan="3">',
            '<img class="dir-icon" src="images/folder.png">',
            '<div class="dir-name">', sd.name, '</div></td></tr>');
        index += 1;
      }
      this.sd_count = index;
      for(const m of ml) {
        const
            kbytes = UI.sizeInKBytesAsHTML(m.size),
            sel = (index === this.model_index ? ' sel-set' : '');
        rows.push('<tr id="dir-entry-', index, '" class="module', sel,
            '" onclick="FILE_MANAGER.selectEntry(event, ', index, ');"><td>',
            '<img class="dir-icon" src="images/icon.png">',
            '<div class="dir-name">', m.name, '</div></td><td class="date-time">',
            m.time.substring(0, 16).replace('T', ' '),
            '</td><td class="k-bytes">',
            kbytes, '</td></tr>');
        index += 1;
      }
      this.mcount = index - this.sd_count;
    }
    this.model_table.innerHTML = rows.join('');
    this.model_sa.title = pluralS(this.mcount, 'model');
  }
  
  doubleClicked(row) {
    // Return TRUE if click on row should be interpreted as a double-click.
    while(row.tagName !== 'TR') row = row.parentNode;
    const
        now = Date.now(),
        dt = now - this.last_time_clicked;
    this.last_time_clicked = now;
    if(row.id === this.clicked_row) {
      // Consider click to be "double" if it occurred less than 300 ms ago.
      if(dt < 300) {
        this.last_time_clicked = 0;
        return true;
      }
    }
    this.clicked_row = row.id;
    return false;
  }
  
  enterKey() {
    // Interpret ENTER as a double-click on the selected entry in the
    // focal table..
    if(!this.focal_table) this.focal_table = this.dir_table;
    const srl = this.focal_table.getElementsByClassName('sel-set');
    if(srl.length > 0) {
      const r = this.focal_table.rows[srl[0].rowIndex];
      if(r) {
        // Ensure that click will be interpreted as double-click.
        this.clicked_row = r.id;
        this.last_time_clicked = Date.now();
        r.dispatchEvent(new Event('click'));
      }
    }
  }
  
  upDownKey(dir) {
    // Select row above or below the selected one (if possible).
    if(!this.focal_table) this.focal_table = this.dataset_table;
    const srl = this.focal_table.getElementsByClassName('sel-set');
    if(srl.length > 0) {
      const r = this.focal_table.rows[srl[0].rowIndex + dir];
      if(r) {
        UI.scrollIntoView(r);
        r.dispatchEvent(new Event('click'));
      }
    }
  }
  
  getDirContents(d=this.selected_dir) {
    // Fetch contents for directory `d`.
    // NOTE: GitHub directory tree is static => do nothing. 
    if(!d || d.root === 'github') return;
    // For local file system, the directory contents may have changed.
    fetch('browse/', postData({action: 'dir', root: d.root, path: d.path}))
      .then(UI.fetchText)
      .then((data) => {
          if(data && UI.postResponseOK(data)) {
            try {
              const dc = JSON.parse(data);
              d.subdirs = dc.subdirs;
              d.models = dc.models;
              FILE_MANAGER.updateDirectoryTable();
            } catch(err) {
              UI.alert('File browser failed to get directory contents', err);
            }
          }
        })
      .catch(UI.fetchCatch);    
    
  }

  toggleDir(event, n) {
    // Open/close a directory.
    if(event) event.stopPropagation();
    const d = this.dir_list[n];
    d.open = !d.open;
    if(d.root === 'github') {
      // GitHub directory is static => just refresh the table.
      FILE_MANAGER.updateDirectoryTable();
    } else {
      // NOTE: When closing directory `d`, select it when the currently
      // selected directory is a sub-directory of `d`.
      if(!d.open && d !== this.selected_dir &&
          this.selected_dir.path.startsWith(d.path + this.separator)) {
        this.selected_dir = d;
        this.model_index = -1;
        this.updateModelTable();
        this.updateButtons();
        this.updatePath();
      }
      // Local directory content may have changed => get it.
      this.getDirContents(d);
    }
  }
  
  selectDir(event, n) {
    // Select directory in list.
    event.stopPropagation();
    this.focal_table = this.dir_table;
    const
        dc = this.doubleClicked(event.target),
        sd = this.dir_list[n],
        change = this.selected_dir !== sd;
    this.selected_dir = sd;
    if(dc && sd.subdirs.length) {
      this.toggleDir(null, n);
    } else {
      this.updateDirectoryTable();
      if(change) {
        this.model_index = -1;
        this.updateModelTable();
        this.updateButtons();
        this.updatePath();
      }
    }
  }
  
  selectEntry(event, n) {
    // Select model in list; if double-clicked, load it and hide dialog.
    event.stopPropagation();
    if(this.selected_dir) {
      this.focal_table = this.model_table;
      const dc = this.doubleClicked(event.target);
      if(dc) {
        if(n < this.sd_count) {
          // Entry is a sub-directory => First ensure that parent is open.
          let di = this.dir_list.indexOf(this.selected_dir);
          if(!this.selected_dir.open) this.toggleDir(null, di);
          this.model_index = -1;
          // Then schedule that the double-clicked directory will be selected.
          setTimeout((ndi) => FILE_MANAGER.selectDir(event, ndi),
              // Wait for 300 ms; new dir index is selected plus sub-index + 1.
              300, di + n + 1);
        } else {
          // All other actions require a model file to be loaded first. The loading
          // method will eventually (after data is read and possibly decrypted) call
          // the method `processXML(data)` that will perform the action for which
          // the browser modal was opened(load, include, update or compare).
          this.getModelFromServer();
        }
        return;
      }
      this.model_index = n;
    } else {
      this.model_index = -1;
    }
    this.updateModelTable();
    this.updateButtons();
    this.updatePath();
  }

  //
  // Methods for storing/loading/deleting a model file.
  //

  asFilePath(s, no_sep=false) {
    // Return string `s` with whitespace converted to a single dash, and
    // special characters (also periods!) converted to underscores.
    // NOTE: Permit functional use of directory separator unless `no_sep`
    // is FALSE.
    const sanitize = (str) => str.trim()
        // Condense whitespace into a single dash.
        .replace(/[\s\-]+/g, '-')
        // Condense special characters into a single underscore.
        .replace(/[^A-Za-z0-9_\-]+/g, '_')
        // No leading or trailing dashes or underscores.
        .replace(/^[\-\_]+|[\-\_]+$/g, '');
    s = s.trim().normalize('NFKD');
    if(no_sep) return sanitize(s);
    // When path is acceptable, split at both '/' and '\', because
    // names may be constructed on different OS platforms.
    return s.trim().split(/\/|\\/)
        .map((p) => sanitize(p))
        // Remove empty strings.
        .filter((p) => p)
        // Use the OS platform separator to reconstruct the path.
        .join(this.separator);
  }

  promptForModelName() {
    // Prompt user for model name and author name.
    const
        md = UI.modals.save,
        bb = md.element('black-box-div');
    md.element('name').value = MODEL.name;
    md.element('author').value = MODEL.author;
    // Always show the encryption option.
    UI.setBox('save-encrypt', MODEL.encrypt);
    // Only show the "black box" option if that is relevant.
    MODEL.inferBlackBoxEntities();
    if(Object.keys(MODEL.black_box_entities).length) {
      bb.style.display = 'inline-block';
    } else {
      bb.style.display = 'none';
    }
    md.show('name');
  }
  
  saveAsNewModel() {
    // Change model properties (name, author, encrypt) and then save
    // "as usual".
    const md = UI.modals.save;
    MODEL.name = md.element('name').value.trim();
    // NOTE: Author names should not contain potential path delimiters.
    MODEL.author = md.element('author').value.trim()
        .replaceAll(/\\|\//g, '');
    MODEL.encrypt = UI.boxChecked('save-encrypt');
    if(!this.asFilePath(MODEL.name)) {
      UI.warn('Invalid model name');
      md.focus('name');
    } else {
      md.hide();
      if(UI.boxChecked('save-black-box')) {
        this.storeModel(MODEL.asBlackBoxXML);
      } else {
        this.storeModel(MODEL.asXML);
      }
    }
  }

  storeModel(xml) {
    // Store the current model.
    if(this.download_via_browser) {
      this.pushModelToBrowser(xml);
      return;
    }
    const fp = this.asFilePath(MODEL.name) || 'model';
    fetch('browse/', postData({
        action: 'store',
        root: this.selected_dir.root,
        path: this.selected_dir.path,
        model: fp,
        xml: xml
      }))
    .then(UI.fetchText)
    .then((data) => {
        if(UI.postResponseOK(data, true)) {
          // Update the contents of the selected directory.
          FILE_MANAGER.getDirContents();
          UI.modals.browser.hide();
        }
      })
    .catch(UI.fetchCatch);
  }
  
  deleteModel() {
    // Delete the selected model.
    this.confirm_delete_modal.hide();
    if(this.selected_dir && this.model_index >= this.sd_count) {
      const mdl = this.selected_dir.models[this.model_index - this.sd_count];
      if(mdl) fetch('browse/', postData({
          action: 'delete',
          root: this.selected_dir.root,
          path: this.selected_dir.path,
          model: mdl.name
        }))
      .then(UI.fetchText)
      .then((data) => {
          if(UI.postResponseOK(data, true)) {
            FILE_MANAGER.getDirContents();
            setTimeout(() => {
                FILE_MANAGER.model_index = -1;
                FILE_MANAGER.updateModelTable();
                FILE_MANAGER.updateButtons();
             }, 250);
          }
        })
      .catch(UI.fetchCatch);
    }
  }

  showUploadModal() {
    // Clear path, as file upload via browser has no name.
    UI.modals.browser.hide();
    const
        md = this.upload_modal,
        mda = md.element('action');
    if(this.action === 'load') {
      mda.innerText = 'Load';
    } else if(this.action === 'include') {
      mda.innerText = 'Include';
    } else if(this.action === 'compare') {
      mda.innerText = 'Compare current model with another';
    }
    md.show();
  }

  uploadModelViaBrowser() {
    // Get the XML of the file selected in the Upload dialog.
    const md = this.upload_modal;
    md.hide();
    try {
      const file = md.element('xml-file').files[0];
      if(!file) return;
      // Record name of file so it can be displayed on the information line
      // after loading, and be used as module name.
      this.model_file_name = file.name.toLowerCase();
      if(this.model_file_name.indexOf('.') > 0) {
        const parts = this.model_file_name.split('.');
        if(parts.pop() !== 'lnr') {
          UI.warn('Linny-R files should have extension .lnr');
        }
        this.model_file_name = parts.join('.');
      }
console.log('HERE model file', this.model_file_name);
      const reader = new FileReader();
      reader.onload = (event) =>
          FILE_MANAGER.decryptIfNeeded(event.target.result);
      reader.readAsText(file);
    } catch(err) {
      UI.alert('Error while reading file: ' + err);
    }
  }

  getModelFromServer() {
    // Load Linny-R model from selected location (if any).
    // NOTE: Do not proceed when a sub-directory is selected.
    if(!this.selected_dir || this.model_index < this.sd_count) return;
    const mdl = this.selected_dir.models[this.model_index - this.sd_count];
    if(!mdl) return;
    // Record location of file so it can be displayed on the information line
    // after loading.
    this.model_file_name = mdl.name;
    if(this.action === 'load') {
      // When loading new model, the stay-on-top dialogs must be reset
      // (GUI only; for the Linny-R console this is a "dummy" method).
      UI.hideStayOnTopDialogs();
    }
    // Get the model entry.
    fetch('browse/', postData({
          action: 'load',
          root: this.selected_dir.root,
          path: this.selected_dir.path,
          model: mdl.name
        }))
      .then(UI.fetchText)
      .then((data) => {
          if(data && UI.postResponseOK(data)) {
            UI.modals.browser.hide();
            FILE_MANAGER.decryptIfNeeded(data);
          }
        })
      .catch(UI.fetchCatch);
  }

  decryptIfNeeded(data) {
    // If not encrypted, processes data "as is".
    if(data.indexOf('model latch="') < 0) {
      this.processXML(data);
      return;
    }
    // Otherwise, pass encryption parameters to the password modal dialog...
    const
        xml = parseXML(data),
        md = UI.modals.password;
    md.encrypted_msg = {
        encryption: nodeContentByTag(xml, 'content'),
        latch: nodeParameterValue(xml, 'latch')
      };
    // ... and change the dialog title so that it prompts for entering the
    // password, and change the OK response so that it will decrypt.
    md.element('action').innerHTML = 'Enter';
    md.ok = UI.removeListeners(md.ok);
    md.ok.addEventListener('click', () => FILE_MANAGER.startToDecrypt());
    this.updateStrength();
    md.show('code');
  }
  
  startToDecrypt() {
    // Wrapper function to permit DOM events to occur first.
    const
        md = UI.modals.password,
        encr_msg = md.encrypted_msg,
        code = md.element('code'),
        password = code.value;
    // NOTE: Immediately clear password field.
    code.value = '';
    md.hide();
    UI.waitingCursor();
    UI.setMessage('Decrypting...');
    // NOTE: Asynchronous function tryToDecrypt is defined in linny-r-utils.js.
    setTimeout((msg, pwd, ok, err) => tryToDecrypt(msg, pwd, ok, err), 5,
        encr_msg, password,
        // The on_ok function
        (data) => {
            if(data) FILE_MANAGER.processXML(data);
            UI.normalCursor();
            UI.modals.password.encrypted_msg = null;
          },
        // The on_error function
        (err) => {
            UI.warn('Failed to load encrypted model', err);
            UI.modals.password.encrypted_msg = null;
          });
  }
  
  processXML(data) {
    // Process data (XML string) according to the action set for
    // the File manager.
    if(this.action === 'load') {
      if(UI.loadModelFromXML(data)) {
        UI.notify(`Model loaded from <tt>${this.model_file_name}</tt>`);
      }
    } else if(this.action === 'compare') {
      this.compareModels(data);
    } else {
      let xml;
      try {
        xml = parseXML(data);
      } catch(err) {
        UI.warn('Failed to parse XML', err);
        return;
      }
      if(this.action === 'update') {
        // Prompt user to select module set to be updated.
        this.promptForUpdate(xml);
      } else if(this.action === 'include') {
        // Include module into current model.
        this.promptForInclusion(xml);
      }
    }
  }
  
  //
  // Methods that implement the inclusion of the selected module.
  //

  promptForInclusion(node) {
    // Add entities defined in the parsed XML tree with root `node`.
    IO_CONTEXT = new IOContext(this.model_file_name, node);
    const md = this.include_modal;
    md.element('name').innerHTML = IO_CONTEXT.file_name;
    md.element('prefix').value = '';
    md.element('actor').value = '';
    md.element('scroll-area').innerHTML = IO_CONTEXT.parameterTable;
    md.show('prefix');
  }
  
  suggestBindings() {
    // Select for each "Cluster: XXX" drop-down the one that matches the
    // value of the prefix input field.
    const
        md = this.include_modal,
        prefix = md.element('prefix').value.trim(),
        sa = md.element('scroll-area'),
        sels = sa.querySelectorAll('select');
    for(const sel of sels) {
      const
          oid = UI.nameToID(prefix) + ':_' + sel.id,
          ids = [...sel.options].map(o => o.value);
      if(ids.indexOf(oid) >= 0) sel.value = oid;
    }
  }
    
  updateActors() {
    // Add actor (if specified) to model, and then updates the selector options
    // for each actor binding selector.
    if(!IO_CONTEXT) return;
    const
        aname = this.include_modal.element('actor').value.trim(),
        aid = UI.nameToID(aname);
    if(aname && !MODEL.actors.hasOwnProperty(aid)) {
      MODEL.addActor(aname);
      for(let id in IO_CONTEXT.bindings)
        if(IO_CONTEXT.bindings.hasOwnProperty(id)) {
          const b = IO_CONTEXT.bindings[id];
          if(b.entity_type === 'Actor' && b.io_type === 1) {
            const o = new Option(aname, aid);
            o.innerHTML = aname;
            document.getElementById(b.id).appendChild(o);
          }
        }
    }
  }
  
  parameterBinding(name) {
    // Return the selected option (as DOM element) of the the parameter
    // selector identified by its element name (!) in the Include modal.
    let sel = null;
    for(const e of document.getElementsByName(name)) {
      if(e.type.indexOf('select') === 0) {
        sel = e;
        break;
      }
    }
    if(!sel) UI.alert(`Parameter selector "${name}" not found`);
    return sel;
  }
  
  performInclusion() {
    // Include the selected model as "module" cluster in the model.
    // This is effectuated by "re-initializing" the current model using
    // the XML of the model-to-be-included with the contextualization as
    // indicated by the modeler.
    if(!IO_CONTEXT) {
      UI.alert('Cannot include module without context');
      return;
    }
    const pref = this.include_modal.element('prefix');
    IO_CONTEXT.prefix = pref.value.trim();
    if(!UI.validName(IO_CONTEXT.prefix)) {
      UI.warn(`Invalid cluster name "${IO_CONTEXT.prefix}"`);
      pref.focus();
      return;
    }
    // NOTE: Prefix must not already be in use as entity name.
    let obj = MODEL.objectByName(IO_CONTEXT.prefix);
    if(obj) {
      UI.warningEntityExists(obj, IO_CONTEXT.prefix);
      pref.value = '';
      pref.focus();
      return;
    }
    IO_CONTEXT.actor_name = this.include_modal.element('actor').value.trim();
    MODEL.clearSelection();
    IO_CONTEXT.bindParameters();
    // NOTE: Including may affect focal cluster, so store it...
    const fc = MODEL.focal_cluster;
    MODEL.initFromXML(IO_CONTEXT.xml);
    // ... and restore it afterwards.
    MODEL.focal_cluster = fc;
    let counts = `: ${pluralS(IO_CONTEXT.added_nodes.length, 'node')}, ` +
        pluralS(IO_CONTEXT.added_links.length, 'link');
    if(IO_CONTEXT.superseded.length > 0) {
      counts += ` (superseded ${IO_CONTEXT.superseded.length})`;
      console.log('SUPERSEDED:', IO_CONTEXT.superseded);
    }
    UI.notify(`Model <tt>${IO_CONTEXT.file_name}</tt> included as ` +
        `<em>${IO_CONTEXT.clusterName}</em>${counts}`);
    // Get the containing cluster.
    obj = MODEL.objectByName(IO_CONTEXT.clusterName);
    if(obj instanceof Cluster) {
      // Record from which module it has been included with what bindings.
      obj.module = {name: IO_CONTEXT.file_name,
          bindings: IO_CONTEXT.copyOfBindings};
      // Position it in the focal cluster at the clicked cursor position.
      // NOTE: Originally, X and Y were inferred as shown below.
      obj.x = UI.add_x; // IO_CONTEXT.centroid_x;
      obj.y = UI.add_y; // IO_CONTEXT.centroid_y;
      obj.clearAllProcesses();
    } else {
      UI.alert('Include failed to create a cluster');
    }
    // Reset the IO context.
    IO_CONTEXT = null;
    this.include_modal.hide();
    MODEL.cleanUpActors();
    MODEL.focal_cluster.clearAllProcesses();
    UI.drawDiagram(MODEL);
    // Select the newly added cluster.
    if(obj) MODEL.select(obj);
    // Update dataset manager if shown (as new datasets may have been added).
    if(DATASET_MANAGER.visible) DATASET_MANAGER.updateDialog();
  }
  
  cancelInclusion() {
    // Clear the IO context and closes the inclusion dialog.
    IO_CONTEXT = null;
    this.include_modal.hide();
  }
  
  //
  // Methods that implement updating of previously included clusters.
  //

  promptForUpdate(node) {
    // Add entities defined in the parsed XML tree with root `node`.
    this.included_modules = MODEL.includedModules;
    const
        md = this.update_modal,
        options = [],
        keys = Object.keys(this.included_modules).sort(compareWithTailNumbers),
        // Use file name without tail number as basis for comparison.
        fwot = this.model_file_name.replace(/\-\d+$/, '');
    // Do not prompt if no modules referenced by clusters.
    if(!keys.length) return;
    IO_CONTEXT = new IOContext(this.model_file_name, node);
    let index = -1,
        mcnt = '';
    for(const k of keys) {
      const tn = endsWithDigits(k);
      if(tn && k === `${fwot}-${tn}`) {
        index = options.length;
        mcnt = `(${pluralS(this.included_modules[k].length, 'cluster')})`;
      }
      options.push('<option value="', k, '">', k, '</option>');
    }
    if(index >= 0) options[index].replace('">', '" selected>');
    md.element('name').innerHTML = IO_CONTEXT.file_name;
    md.element('module').innerHTML = options.join('');
    md.element('count').innerText = mcnt;
    md.element('issues').style.display = 'none';
    md.element('remove').style.display = 'none';
    md.show('module');
    this.checkUpdateBindings();
  }
  
  checkUpdateBindings() {
    // Verify that all module parameters are bound by the previous
    // bindings, or that such binding can be inferred.
    const
        md = this.update_modal,
        mkey = md.element('module').value,
        iml = this.included_modules[mkey],
        mcnt = `(${pluralS(iml.length, 'cluster')})`,
        missing_params = {},
        resolved = {},
        cnlist = [];
    for(const im of iml) cnlist.push(safeDoubleQuotes(im.displayName));
    md.element('count').innerText = mcnt;
    md.element('count').title = cnlist.sort().join('\n');
    this.obsolete_items = [];
    // Check bindings of the included clusters.
    for(const im of iml) {
      const
          cn = im.name,
          iob = im.module.bindings,
          bk = Object.keys(iob),
          ck = Object.keys(IO_CONTEXT.bindings),
          missing = complement(ck, bk);
      if(missing.length) {
        // Try to match name in module with existing prefixed entity in model.
        for(let mi = missing.length - 1; mi >= 0; mi--) {
          const
              mk = missing[mi],
              mb = IO_CONTEXT.bindings[mk];
          if(mb.io_type === 2) {
            // Actual name = formal name, so known.
            missing.splice(mi, 1);
          } else {
            // First guess is that binding should be Cluster: Name.
            let pent = cn + UI.PREFIXER + mb.name_in_module,
                obj = MODEL.objectByName(pent);
            if(!obj || obj.type !== mb.entity_type) {
              // Second guess is that binding should be Name: Cluster.
              pent = mb.name_in_module + UI.PREFIXER + cn;
              obj = MODEL.objectByName(pent);
            }
            if(obj && obj.type === mb.entity_type) {
              iob[mk] = new IOBinding(mb.io_type, mb.entity_type,
                  mb.is_data, mb.name_in_module);
              iob[mk].actual_name = pent;
              if(resolved.hasOwnProperty(mk)) {
                resolved[mk].push(cn);
              } else {
                resolved[mk] = [cn];
              }
            }
          }
        }
      }
      for(const m of missing) {
        if(missing_params.hasOwnProperty(m)) {
          missing_params[m].push(cn);
        } else {
          missing_params[m] = [cn];
        }
      }
      for(const k of MODEL.datasetKeysByPrefix(cn)) {
        this.obsolete_items.push(MODEL.datasets[k]);
      }
      for(const e of MODEL.equationsByPrefix(cn)) this.obsolete_items.push(e);
      for(const c of MODEL.chartsByPrefix(cn)) this.obsolete_items.push(c);
    }
    for(const k of Object.keys(resolved)) {
      if(resolved[k].length >= missing_params[k].length) {
        delete missing_params[k];
      } else {
        missing_params[k] = complement(missing_params[k], resolved[k]);
      }
    }
    const
        remove_div = md.element('remove'),
        remove_count = md.element('remove-count'),
        remove_list = md.element('remove-area');
    if(this.obsolete_items.length) {
      remove_count.innerHTML = pluralS(this.obsolete_items.length,
          'obsolete item');
      const html = [];
      for(const item of this.obsolete_items.sort(
          (a, b) => {
            const
                at = a.type,
                bt = b.type,
                order = ['Dataset', 'Equation', 'Chart'];
            if(at === bt) return ciCompare(a.displayName, b.displayName);
            return order.indexOf(at) - order.indexOf(bt);
          })) {
        html.push('<div><img src="images/', item.type.toLowerCase(),
            '.png" class="sbtn">', item.displayName, '</div>');
      }
      remove_list.innerHTML = html.join('');
      remove_div.style.display = 'block';
    } else {
      remove_count.innerHTML = '';
      remove_list.innerHTML = '';
      remove_div.style.display = 'none';
    }
    const
        issues_div = md.element('issues'),
        issues_header = md.element('issues-header'),
        issues_list = md.element('issues-area'),
        mpkeys = Object.keys(missing_params);
    if(mpkeys.length) {
      // When parameters are missing, report this...
      issues_header.innerHTML = pluralS(mpkeys.length, 'unresolved parameter');
      const html = [];
      for(const k of mpkeys) {
        const mb = IO_CONTEXT.bindings[k];
        cnlist.length = 0;
        for(const cn of missing_params[k]) {
          cnlist.push(safeDoubleQuotes(cn));
        }
        html.push('<div>', mb.name_in_module,
            '<div class="update-cc" title="', cnlist.sort().join('\n'),
            '"> (in ', pluralS(cnlist.length, 'cluster'), ')</div></div>');
      }
      issues_list.innerHTML = html.join('');
      issues_div.style.display = 'block';
      // ... and disable the OK button so that no update can be performed.
      md.ok.classList.add('disab');
      IO_CONTEXT = null;
    } else {
      // No issues report.
      issues_header.innerHTML = '';
      issues_list.innerHTML = '';
      issues_div.style.display = 'none';
      // Enable the OK button so that update can be performed.
      md.ok.classList.remove('disab');
    }
  }
  
  performUpdate() {
    // Update all eligible previously included modules.
    if(!IO_CONTEXT) {
      UI.alert('Cannot update modules without context');
      return;
    }
    const
        md = this.update_modal,
        mkey = md.element('module').value,
        iml = this.included_modules[mkey];
    MODEL.clearSelection();
    // Delete obsolete items from the model.
    for(const item of this.obsolete_items) {
      if(item instanceof Dataset) {
        delete MODEL.datasets[item.identifier];
      } else if(item instanceof DatasetModifier) {
        delete MODEL.equations_dataset.modifiers[UI.nameToID(item.selector)];
      } else if(item instanceof Chart) {
        MODEL.deleteChart(MODEL.charts.indexOf(item));
      }
    }
    // NOTE: The included module list contains clusters.
    const last = iml[iml.length - 1];
    // Ensure that expressions are recompiled only after the last inclusion.
    for(const c of iml) this.updateCluster(c, c === last);
    // Notify modeler of the scope of the update.
    let counts = `: ${pluralS(IO_CONTEXT.added_nodes.length, 'node')}, ` +
        pluralS(IO_CONTEXT.added_links.length, 'link');
    if(IO_CONTEXT.superseded.length > 0) {
      counts += ` (superseded ${IO_CONTEXT.superseded.length})`;
      console.log('SUPERSEDED:', IO_CONTEXT.superseded);
    }
    UI.notify(`Model updated using <tt>${IO_CONTEXT.file_name}</tt>${counts}`);
    // Reset the IO context.
    IO_CONTEXT = null;
    this.update_modal.hide();
    MODEL.cleanUpActors();
    MODEL.focal_cluster.clearAllProcesses();
    UI.drawDiagram(MODEL);
    UI.updateControllerDialogs('CDEFJX');
  }
  
  updateCluster(c, last) {
    // Update perviously included cluster `c`.
    // Remember the XY-position of the cluster. 
    const 
        cx = c.x,
        cy = c.y;
    // The name of `c` will be used again as prefix.
    IO_CONTEXT.prefix = c.name;
    IO_CONTEXT.actor_name = UI.realActorName(c.actor.name);
    // NOTE: `last` = TRUE indicates that expressions must be recompiled
    // only after updating this cluster.
    IO_CONTEXT.recompile = last;
    // Copy the original bindings to the IO context.
    const ob = c.module.bindings;
    for(const k of Object.keys(ob)) {
      // NOTE: Only copy bindings for parameters of the module used for updating.
      if(IO_CONTEXT.bindings.hasOwnProperty(k)) {
        const nb = IO_CONTEXT.bindings[k];
        nb.actual_name = ob[k].actual_name;
        nb.actual_id = UI.nameToID(nb.actual_name);
      }
    }
    // Delete `c` from the model without adding its XML (UNDO to be implemented).
    MODEL.deleteCluster(c, false);
    // NOTE: Including may affect focal cluster, so store it...
    const fc = MODEL.focal_cluster;
    MODEL.initFromXML(IO_CONTEXT.xml);
    // ... and restore it afterwards.
    MODEL.focal_cluster = fc;
    // Get the newly added cluster.
    const nac = MODEL.objectByName(IO_CONTEXT.clusterName);
    if(nac instanceof Cluster) {
      // Record from which module it has been included with what bindings.
      nac.module = {name: IO_CONTEXT.file_name,
          bindings: IO_CONTEXT.copyOfBindings};
      // Give the updated cluster the same position as the original one.
      nac.x = cx;
      nac.y = cy;
      // Prepare for redraw.
      nac.clearAllProcesses();
      return true;
    }
    UI.alert('Update failed to create a cluster');
    return false;
  }

  cancelUpdate() {
    // Clear the IO context and closes the update dialog.
    IO_CONTEXT = null;
    this.update_modal.hide();
  }
  

  // NOTE: The modal dialogs related to loading and saving a model file
  // are properties of the GUIController because they are activated by
  // buttons on the top menu.

  getRemoteData(dataset, url) {
    // Gets data from a URL, or from a file on the local host.
    if(url === '') return;
    if(url.indexOf('%') >= 0) {
      // Expand %i, %j and %k if used in the URL.
      for(const l of ['i', 'j', 'k']) {
        url = url.replaceAll('%' + l, valueOfIndexVariable(l));
      }
    }
    // NOTE: add this dataset to the "loading" list...
    addDistinct(dataset, MODEL.loading_datasets);
    // ... and allow for 3 more seconds (6 times 500 ms) to complete
    MODEL.max_time_to_load += 6;
    // Send the "load data" request to the server
    fetch('load-data/', postData({'url': url}))
      .then(UI.fetchText)
      .then((data) => {
          if(data && UI.postResponseOK(data)) {
            if(dataset instanceof BoundLine) {
              // Server must return semicolon-separated list of white-
              // space-separated list of numbers.
              dataset.unpackPointDataString(data);
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
                // NOTE: FALSE indicates that data is *not* B62-encoded.
                dataset.unpackDataString(data, false);
              }
            }
            // NOTE: remove dataset from the "loading" list
            const i = MODEL.loading_datasets.indexOf(dataset);
            if(i >= 0) MODEL.loading_datasets.splice(i, 1);
          }
        })
      .catch(UI.fetchCatch);
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
  
  saveModel(event) {
    // Save the current model in the user workspace (via the server) when
    // the Save button is clicked, or as a download (directly from the browser)
    // when the Alt-button is pressed.
    this.download_via_browser = event.altKey;
    MODEL.clearSelection();
    // Prompt for model name when still blank, or when Shift-key is pressed.
    if(!MODEL.name || event.shiftKey) {
      this.promptForModelName();
    } else if(MODEL.encrypt) {
      const md = UI.modals.password;
      md.encryption_code = '';
      md.element('action').innerHTML = 'Set';
      md.ok = UI.removeListeners(md.ok);
      md.ok.addEventListener('click', () => FILE_MANAGER.confirmPassword());
      this.updateStrength();
      md.show('code');
    } else {
      this.storeModel(MODEL.asXML);
    }
  }
  
  pushModelToBrowser(xml) {
    // Save model as .lnr file.
    UI.setMessage('Model file size: ' + UI.sizeInBytes(xml.length));
    const el = document.getElementById('xml-saver');
    el.href = 'data:attachment/text,' + encodeURI(xml);
    console.log('Encoded file size:', el.href.length);
    // Use sanitized model name as file name.
    el.download = (this.asFilePath(MODEL.name, true) || 'model') + '.lnr';
    if(el.href.length > 25*1024*1024 &&
        navigator.userAgent.search('Chrome') <= 0) {
      UI.notify('Model file size exceeds 25 MB. ' +
          'If it does not download, store it via the file browser');
    }
    el.click();
    // Clear the HREF after 3 seconds or it may use a lot of memory.
    setTimeout(
        () => { document.getElementById('xml-saver').href = ''; }, 3000);
    UI.normalCursor();
    this.download_via_browser = false;
  }
  
  encryptModel() {
    const
        md = UI.modals.password,
        code = md.element('code'),
        pwd = code.value;
    // NOTE: Immediately clear password field.
    code.value = '';
    md.hide();
    if(pwd !== md.encryption_code) {
      UI.warn('Encryption passwords did not match');
      return;
    }
    UI.setMessage('Encrypting...');
    UI.waitingCursor();
    // Wait for key (NOTE: asynchronous functions defined in linny-r.js).
    encryptionKey(pwd)
      .then((key) => encryptMessage(MODEL.asXML, key)
          .then((enc) => this.storeModel(MODEL.asEncryptedXML(enc)))
          .catch((err) => {
              UI.alert('Encryption failed');
              console.log(err);
            }))
      .catch((err) => {
          UI.alert('Failed to get encryption key');
          console.log(err);
        });
  }

//
// Auto-save functionality
//

  setAutoSaveSettings(ass=null) {
    // Set the specified settings (if valid).
    const as_btn = this.modal.element('autosave-btn');
    if(typeof ass === 'object' && typeof ass.hours === 'number' &&
        typeof ass.minutes === 'number') {
      this.autosave_settings = ass;
      as_btn.classList.remove('off');
      as_btn.classList.add('enab');
      // NOTE: Purge only once per Linny-R session.
      this.purgeAutoSavedModels();
    } else {
      this.autosave_settings = null;
      as_btn.classList.remove('enab');
      as_btn.classList.add('off');
    }
  }
  
  setAutoSaveInterval() {
    // Activate the auto-save feature (if interval is configured).
    if(!this.autosave_settings) return;
    if(this.autosave_timeout_id) clearInterval(this.autosave_timeout_id);
    // NOTE: Minutes = 0 indicates "do not auto-save".
    const m = this.autosave_settings.minutes;
    if(m) {
      // NOTE: Multiply minutes by 60 thousand to get msec.
      this.autosave_timeout_id = setInterval(
          () => FILE_MANAGER.autoSaveModel(), m * 60000);
    }
  }
  
  autoSaveModel() {
    // Store the current model in the local auto-save directory.
    if(!this.autosave_settings || MODEL.running_experiment) {
      console.log('No autosaving while running an experiment');
      return;
    }
    const
        // NOTE: Auto-save directory cannot have sub-directories, hence
        // sanitize file names specifying sub-directories.
        mname = MODEL.name.replaceAll(/\\|\//g, '_') || 'no-name',
        aname = MODEL.author || 'no-author';
    fetch('browse/', postData({
          action: 'store',
          root: 'autosave',
          path: '',
          model: this.asFilePath(`${mname}_by_${aname}.lnr`),
          xml: MODEL.asXML
        }))
      .then(UI.fetchText)
      .then((data) => {
          // Notify user where the model file has been stored.
          if(UI.postResponseOK(data)) UI.notify(data);
        })
      .catch(UI.fetchCatch);
  }
  
  purgeAutoSavedModels() {
    if(!this.autosave_settings) return;
    const h = this.autosave_settings.hours;
    if(h <= 0) return;
    fetch('browse/', postData({action: 'purge', period: h}))
      .then(UI.fetchText)
      .then((data) => {
          // Notify user where the model file has been stored.
          if(UI.postResponseOK(data)) {
            console.log('HERE purge response', data);
          }
        })
      .catch(UI.fetchCatch);    
  }
  
  showAutoSaveDialog() {
    // Show dialog with auto-save settings.
    if(!this.autosave_settings) return;
    const md = this.autosave_modal;
    md.element('minutes').value = this.autosave_settings.minutes;
    md.element('hours').value = this.autosave_settings.hours;
    md.show('minutes');    
  }
  
  updateAutoSaveSettings() {
    // Save the auto-save settings and close the modal dialog.
    const md = this.autosave_modal;
    // Validate settings.
    let e = md.element('minutes'),
        m = parseFloat(e.value);
    if(!isNaN(m) || m < 0) {
      e = md.element('hours');
      let h = parseFloat(e.value);
      if(!isNaN(h) || h < 0) {
        m = Math.round(m);
        h = Math.round(h);
        if(m !== this.autosave_settings.hours ||
            h !== this.autosave_settings.minutes) {
          this.autosave_settings = {hours: h, minutes: m};
          this.storeAutoSaveSettings();
          this.setAutoSaveInterval();
        }
        md.hide();
        return;
      }
    }
    // Fall-through on invalid settings.
    UI.warn('Invalid auto-save settings');
    e.focus();
  }

  storeAutoSaveSettings() {
    // Save custom auto-save settings in user workspace.
    if(!this.autosave_settings) return;
    fetch('autosave/', postData(this.autosave_settings))
      .then(UI.fetchText)
      .then((data) => UI.postResponseOK(data, true))
      .catch(UI.fetchCatch);
  }
  
//
// Model comparison functions
//

  compareModels(data) {
    this.modal.hide();
    this.model_B = new LinnyRModel();
    // NOTE: While loading, make the second model "main" so it will initialize.
    const loaded = MODEL;
    MODEL = this.model_B;
    if(!MODEL.parseXML(data)) {
      // Restore original "main" model.
      MODEL = loaded;
      this.model_B = null;
      return false;
    }
    // Restore original "main" model.
    MODEL = loaded;
    try {
      // Store differences as HTML in local storage.
      console.log('Storing differences between model A (' + MODEL.displayName +
          ') and model B (' + this.model_B.displayName + ') as HTML');
      const html = this.differencesAsHTML(MODEL.differences(this.model_B));
      window.localStorage.setItem('linny-r-differences-A-B', html);
      UI.notify('Comparison report can be viewed ' +
        '<a href="./show-diff.html" target="_blank"><strong>here</strong></a>');
    } catch(err) {
      UI.alert(`Failed to store model differences`, err);
    }
    // Dispose the model-for-comparison.
    this.model_B = null;
    // Cursor is set to WAITING when loading starts.
    UI.normalCursor();
  }
  
  propertyName(p) {
    // Returns the name of a Linny-R entity property as HTML-italicized string
    // if `p` is recognized as such, or otherwise `p` itself
    if(p in UI.MC.SETTINGS_PROPS) return `<em>${UI.MC.SETTINGS_PROPS[p]}:</em>`;
    if(UI.MC.ALL_PROPS.indexOf(p) >= 0) return '<em>' + p.charAt(0).toUpperCase() +
        p.slice(1).replace('_', '&nbsp;') + ':</em>';
    return p;
  }

  propertyAsString(p) {
    // Returns the value of `p` as an HTML string for Model Comparison report 
    if(p === true) return '<code>true</code>';
    if(p === false) return '<code>false</code>';
    const top = typeof p;
    if(top === 'number') return VM.sig4Dig(p);
    if(top === 'string') return (p.length === 0 ? '<em>(empty)</em>' : p);
    return p.toString();
  }
  
  differencesAsHTML(d) {
    const html = [];
    let n = (Object.keys(d).length > 0 ? 'D' : 'No d');
    html.push('<h1>' + n + 'ifferences between model A and model B</h1>');
    html.push('<p><em>Model</em> <strong>A</strong> <em>is <u>current</u>, ',
        'model</em> <strong>B</strong> <em>was loaded for comparison only.</em>');
    html.push('<table><tr><th>Model</th><th>Name</th><th>Author</th></tr>');
    html.push('<tr><td>A</td><td>' + this.propertyAsString(MODEL.name) +
        '</td><td>'+ this.propertyAsString(MODEL.author) + '</td></tr>');
    html.push('<tr><td>B</td><td>' + this.propertyAsString(this.model_B.name) +
        '</td><td>' + this.propertyAsString(this.model_B.author) +
        '</td></tr></table>');
    if('settings' in d) html.push('<h2>Model settings</h2>',
        this.differenceAsTable(d.settings));
    if('units' in d) html.push('<h2>Units</h2>',
        this.differenceAsTable(d.units));
    for(const e of UI.MC.ENTITY_PROPS) if(e in d) {
      html.push('<h2>' + this.propertyName(e) + '</h2>',
          this.differenceAsTable(d[e]));
    }
    if('charts' in d) html.push('<h2><em>Charts</em></h2>',
        this.differenceAsTable(d.charts));
    return html.join('\n');
  }

  differenceAsTableRow(dd, k) {
    const d = dd[k];
    // NOTE: recursive method, as cells can contain tables
    let tr = '';
    if(Array.isArray(d) && d.length >= 2) {
      tr = '<tr><td class="mc-name">' + this.propertyName(d[1]) + '</td>';
      if(d[0] === UI.MC.MODIFIED) {
        if(d[2].hasOwnProperty('A') && d[2].hasOwnProperty('B')) {
          // Leaf node showing the differring property values in A and B
          const mfd = markFirstDifference(d[2].A, d[2].B);
          tr += `<td class="mc-modified">${mfd}</td><td>${d[2].B}</td>`;
        } else {
          // Compound "dictionary" of differences
          tr += '<td colspan="2">' + this.differenceAsTable(d[2]) + '</td>';
        }
      } else {
        // Addition and deletions are shown for model A 
        tr += `<td class="mc-${UI.MC.STATE[d[0]]}">${UI.MC.STATE[d[0]]}</td><td></td>`;
      }
      tr += '</tr>';
    } else if(d.hasOwnProperty('A') && d.hasOwnProperty('B')) {
      tr = '<tr><td>' + this.propertyName(k) + '</td><td class="mc-modified">'+
          markFirstDifference(d.A, d.B) + '</td><td class="mc-former">' +
          d.B + '</td></tr>';
    } else {
      tr = '<tr><td>' + this.differenceAsTable(d) + '</td></tr>';
    }
    return tr;
  }

  differenceAsTable(d) {
    if(typeof d === 'object') {
      const
          html = ['<table>'],
          keys = Object.keys(d).sort();
      for(const k of keys) html.push(this.differenceAsTableRow(d, k));
      html.push('</table>');
      return html.join('\n');
    }
    return '';
  }

//
// File management functions in support of other dialogs.
//
  
  loadCSVFile() {
    document.getElementById('load-csv-modal').style.display = 'none';
    try {
      const file = document.getElementById('load-csv-file').files[0];
      if(!file) return;
      const reader = new FileReader();
      reader.onload = (event) => DATASET_MANAGER.readCSVData(event.target.result);
      reader.readAsText(file);
    } catch(err) {
      UI.alert('Error while reading file: ' + err);
    }
  }
  
  saveDiagramAsSVG(event) {
    // Output SVG as string with nodes and arrows 100% opaque.
    if(event.altKey) {
      // First align to grid and then fit to size.
      MODEL.alignToGrid();      
      UI.paper.fitToSize(1);
    } else {
      UI.paper.fitToSize();
      MODEL.alignToGrid();      
    }
    if(event.shiftKey) {
      this.pushOutSVG(UI.paper.opaqueSVG);
    } else {
      this.pushOutPNG(UI.paper.opaqueSVG);
    }
  }
  
  pushOutSVG(svg) {
    // Output SVG to browser as SVG image file download.
    const blob = new Blob([svg], {'type': 'image/svg+xml'});
    const e = document.getElementById('svg-saver');
    e.download = this.asFilePath(MODEL.diagramName) + '.svg';
    e.type = 'image/svg+xml';
    e.href = (window.URL || webkitURL).createObjectURL(blob);
    e.click();
  }  

  pushOutPNG(svg) {
    // Output SVG to browser as PNG image file download.
    const
        bytes = new TextEncoder().encode(svg),
        binstr = Array.from(bytes, (b) => String.fromCodePoint(b)).join(''),
        uri = 'data:image/svg+xml;base64,' + window.btoa(binstr),
        img = new Image();
    img.onload = () => {
        const
            cvs = document.createElement('canvas'),
            ctx = cvs.getContext('2d');
        cvs.width = img.width * 4;
        cvs.height = img.height * 4;
        ctx.scale(4, 4);
        ctx.drawImage(img, 0, 0);
        cvs.toBlob(blob => {
            const
                e = document.getElementById('svg-saver'),
                url = (window.URL || webkitURL).createObjectURL(blob);
            e.download = FILE_MANAGER.asFilePath(MODEL.diagramName) + '.png';
            e.type = 'image/png';
            e.href = url;
            e.click();
          });
    };
    img.src = uri;      
  }
 
} // END of class GUIFileManager
