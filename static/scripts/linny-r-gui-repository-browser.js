/*
Linny-R is an executable graphical specification language for (mixed integer)
linear programming (MILP) problems, especially unit commitment problems (UCP).
The Linny-R language and tool have been developed by Pieter Bots at Delft
University of Technology, starting in 2009. The project to develop a browser-
based version started in 2017. See https://linny-r.org for more information.

This JavaScript file (linny-r-gui-repository.js) provides the GUI functionality
for the Linny-R Repository Browser dialog (classes Module, Repository, and
GUIRepositoryBrowser).

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


// CLASS Module
// NOTE: a module is not a model component; merely a wrapper for the name and
// comments properties of a model stored in a repository so that it responds
// as expected by the documentation manager 
class Module {
  constructor(file_name) {
    this.file_name = file_name;
    this.comments = '';
  }

  get type() {
    return 'Module';
  }

  get displayName() {
    // NOTE: module names are file names, and hence displayed in monospaced font
    return `<tt>${this.file_name}<tt>`;
  }
  
} // END of class Module


// CLASS Repository
class Repository {
  constructor(name, aut=false) {
    this.name = name;
    // Authorized to store models if local host, or registered with a valid token 
    this.authorized = aut;
    // NOTE: URL of repository is stored on server => not used in application
    this.module_names = [];
  }
  
  getModuleList() {
    // Obtains the list of modules in this repository from the server
    this.module_names.length = 0;
    fetch('repo/', postData({action: 'dir', repo: this.name}))
      .then((response) => {
          if(!response.ok) {
            UI.alert(`ERROR ${response.status}: ${response.statusText}`);
          }
          return response.text();
        })
      .then((data) => {
          if(UI.postResponseOK(data)) {
            // NOTE: `this` refers to this instance of class Repository
            const repo = REPOSITORY_BROWSER.repositoryByName(this.name);
            if(!repo) throw 'Repository not found';
            // Server returns newline-separated string of formal module names
            // NOTE: these include version number as -nn
            repo.module_names = data.split('\n');
            REPOSITORY_BROWSER.updateDialog();
          }
        })
      .catch((err) => UI.warn(UI.WARNING.NO_CONNECTION, err));
  }

  getModuleInfo(n, m) {
    // Gets the documentation (<notes>) of Linny-R model with index `n` from
    // this repository as `comments` property of module `m`
    fetch('repo/', postData({
          action: 'info',
          repo: this.name,
          file: this.module_names[n]
        }))
      .then((response) => {
          if(!response.ok) {
            UI.alert(`ERROR ${response.status}: ${response.statusText}`);
          }
          return response.text();
        })
      .then((data) => {
          if(UI.postResponseOK(data)) {
            // Server returns the "markdown" text
            m.comments = data;
            // Completely update the documentation manager dialog
            DOCUMENTATION_MANAGER.update(m, true); 
          }
        })
      .catch((err) => UI.warn(UI.WARNING.NO_CONNECTION, err));
  }

  loadModule(n, include=false) {
    // Loads Linny-R model with index `n` from this repository
    // NOTES:
    // (1) when `include` is FALSE, this function behaves as the `loadModel`
    //     method of FileManager; when `include` is TRUE, the module is included
    //     as a cluster (with parameterization via an IO context)
    // (2) loading a module requires no authentication
    fetch('repo/', postData({
          action: 'load',
          repo: this.name,
          file: this.module_names[n]
        }))
      .then((response) => {
          if(!response.ok) {
            UI.alert(`ERROR ${response.status}: ${response.statusText}`);
          }
          return response.text();
        })
      .then((data) => {
          if(data !== '' && UI.postResponseOK(data)) {
            // Server returns Linny-R model file
            if(include) {
              // Include module into current model
              REPOSITORY_BROWSER.promptForInclusion(
                  this.name, this.module_names[n],
                  parseXML(data.replace(/%23/g, '#')));
            } else {
              if(UI.loadModelFromXML(data)) {
                UI.notify(`Model <tt>${this.module_names[n]}</tt> ` +
                  `loaded from <strong>${this.name}</strong>`);
              }
            }
          }
        })
      .catch((err) => UI.warn(UI.WARNING.NO_CONNECTION, err));
  }

  storeModelAsModule(name, black_box=false) {
    // Stores the current model in this repository
    // NOTE: this requires authentication
    UI.waitingCursor();
    fetch('repo/', postData({
          action: 'store',
          repo: this.name,
          file: name,
          xml: (black_box ? MODEL.asBlackBoxXML : MODEL.asXML)
        }))
      .then((response) => {
          if(!response.ok) {
            UI.alert(`ERROR ${response.status}: ${response.statusText}`);
          }
          return response.text();
        })
      .then((data) => {
          // Always display server message on the information line
          UI.postResponseOK(data, true);
          // Deselect any module in the list
          REPOSITORY_BROWSER.module_index = -1;
          const r = REPOSITORY_BROWSER.repositoryByName(this.name);
          if(r) {
            r.getModuleList();
          } else {
            console.log(`ERROR: Failed to return to repository "${this.name}"`);        
          }
          UI.normalCursor();
        })
      .catch((err) => UI.warn(UI.WARNING.NO_CONNECTION, err));
  }

  deleteModule(n) {
    // Deletes the n-th module from the module list of this repository
    // NOTE: this should be accepted only for the local host
    if(this.name !== 'local host') {
      UI.warn('Deletion is restricted to the local host');
      return;
    }
    // Check if `n` is a valid module index
    if(n < 0 || n >= this.module_names.length) {
      UI.alert('Invalid module index: ' + n);
      return;      
    }
    // Send the delete request to the server
    fetch('repo/', postData({
          action: 'delete',
          repo: this.name,
          file: this.module_names[n]
        }))
      .then((response) => {
          if(!response.ok) {
            UI.alert(`ERROR ${response.status}: ${response.statusText}`);
          }
          return response.text();
        })
      .then((data) => {
          // Always display server message on the information line
          UI.postResponseOK(data, true);
          // Deselect any module in the list
          REPOSITORY_BROWSER.module_index = -1;
          const r = REPOSITORY_BROWSER.repositoryByName(this.name);
          if(r) {
            r.getModuleList();
          } else {
            console.log(`ERROR: Failed to return to repository "${this.name}"`);
          }
        })
      .catch((err) => UI.warn(UI.WARNING.NO_CONNECTION, err));
  }

} // END of class Repository


// CLASS GUIRepositoryBrowser
class GUIRepositoryBrowser extends RepositoryBrowser {
  constructor() {
    super();
    this.dialog = UI.draggableDialog('repository');
    UI.resizableDialog('repository', 'REPOSITORY_BROWSER');
    this.close_btn = document.getElementById('repository-close-btn');
    this.close_btn.addEventListener(
        'click', (event) => UI.toggleDialog(event));
    // Make toolbar buttons responsive
    document.getElementById('repo-add-btn').addEventListener(
        'click', () => REPOSITORY_BROWSER.promptForRepository());
    document.getElementById('repo-remove-btn').addEventListener(
        'click', () => REPOSITORY_BROWSER.removeRepository());
    document.getElementById('repo-access-btn').addEventListener(
        'click', () => REPOSITORY_BROWSER.promptForAccess());
    document.getElementById('repo-include-btn').addEventListener(
        'click', () => REPOSITORY_BROWSER.includeModule());
    document.getElementById('repo-load-btn').addEventListener(
        'click', () => REPOSITORY_BROWSER.confirmLoadModuleAsModel());
    document.getElementById('repo-store-btn').addEventListener(
        'click', () => REPOSITORY_BROWSER.promptForStoring());
    document.getElementById('repo-black-box-btn').addEventListener(
        'click', () => REPOSITORY_BROWSER.promptForBlackBoxing());
    document.getElementById('repo-delete-btn').addEventListener(
        'click', () => REPOSITORY_BROWSER.confirmDeleteFromRepository());
    // Other dialog controls
    this.repository_selector = document.getElementById('repository-selector');
    this.repository_selector.addEventListener(
        'change', () => REPOSITORY_BROWSER.selectRepository());
    this.modules_table = document.getElementById('modules-table');
    this.modules_count = document.getElementById('modules-count');

    // Initialize the associated modals
    this.add_modal = new ModalDialog('add-repository');
    this.add_modal.ok.addEventListener(
        'click', () => REPOSITORY_BROWSER.registerRepository());
    this.add_modal.cancel.addEventListener(
        'click', () => REPOSITORY_BROWSER.add_modal.hide());
    
    this.access_modal = new ModalDialog('access-repository');
    this.access_modal.ok.addEventListener(
        'click', () => REPOSITORY_BROWSER.accessRepository());
    this.access_modal.cancel.addEventListener(
        'click', () => REPOSITORY_BROWSER.access_modal.hide());
    
    this.store_modal = new ModalDialog('store-in-repository');
    this.store_modal.ok.addEventListener(
        'click', () => REPOSITORY_BROWSER.storeModel());
    this.store_modal.cancel.addEventListener(
        'click', () => REPOSITORY_BROWSER.store_modal.hide());
    
    this.store_bb_modal = new ModalDialog('store-bb-in-repository');
    this.store_bb_modal.ok.addEventListener(
        'click', () => REPOSITORY_BROWSER.storeBlackBoxModel());
    this.store_bb_modal.cancel.addEventListener(
        'click', () => REPOSITORY_BROWSER.store_bb_modal.hide());
    
    this.include_modal = new ModalDialog('include');
    this.include_modal.ok.addEventListener(
        'click', () => REPOSITORY_BROWSER.performInclusion());
    this.include_modal.cancel.addEventListener(
        'click', () => REPOSITORY_BROWSER.cancelInclusion());
    this.include_modal.element('actor').addEventListener(
        'blur', () => REPOSITORY_BROWSER.updateActors());

    this.confirm_load_modal = new ModalDialog('confirm-load-from-repo');
    this.confirm_load_modal.ok.addEventListener(
        'click', () => REPOSITORY_BROWSER.loadModuleAsModel());
    this.confirm_load_modal.cancel.addEventListener(
        'click', () => REPOSITORY_BROWSER.confirm_load_modal.hide());

    this.confirm_delete_modal = new ModalDialog('confirm-delete-from-repo');
    this.confirm_delete_modal.ok.addEventListener(
        'click', () => REPOSITORY_BROWSER.deleteFromRepository());
    this.confirm_delete_modal.cancel.addEventListener(
        'click', () => REPOSITORY_BROWSER.confirm_delete_modal.hide());
  }

  reset() {
    super.reset();
    this.last_time_selected = 0;
  }

  enterKey() {
    // Open "edit properties" dialog for the selected entity
    const srl = this.modules_table.getElementsByClassName('sel-set');
    if(srl.length > 0) {
      const r = this.modules_table.rows[srl[0].rowIndex];
      if(r) {
        // Ensure that click will be interpreted as double-click
        this.last_time_selected = Date.now();
        r.dispatchEvent(new Event('click'));
      }
    }
  }
  
  upDownKey(dir) {
    // Select row above or below the selected one (if possible)
    const srl = this.modules_table.getElementsByClassName('sel-set');
    if(srl.length > 0) {
      const r = this.modules_table.rows[srl[0].rowIndex + dir];
      if(r) {
        UI.scrollIntoView(r);
        r.dispatchEvent(new Event('click'));
      }
    }
  }
  
  get isLocalHost() {
    // Returns TRUE if first repository on the list is 'local host'
    return this.repositories.length > 0 &&
      this.repositories[0].name === 'local host';
  }

  getRepositories() {
    // Gets the list of repository names from the server
    this.repositories.length = 0;
    fetch('repo/', postData({action: 'list'}))
      .then((response) => {
          if(!response.ok) {
            UI.alert(`ERROR ${response.status}: ${response.statusText}`);
          }
          return response.text();
        })
      .then((data) => {
          if(UI.postResponseOK(data)) {
            // NOTE: trim to prevent empty name strings
            const rl = data.trim().split('\n');
            for(let i = 0; i < rl.length; i++) {
              this.addRepository(rl[i].trim());
            }
          }
          // NOTE: set index to first repository on list (typically local host)
          // unless the list is empty
          this.repository_index = Math.min(0, this.repositories.length - 1);
          this.updateDialog();
        })
      .catch((err) => UI.warn(UI.WARNING.NO_CONNECTION, err));
  }
  
  addRepository(name) {
    // Adds repository if name is unique and valid.
    let r = null,
        can_store = false;
    if(name.endsWith('+')) {
      can_store = true;
      name = name.slice(0, -1);
    }
    if(this.repositoryByName(name)) {
      UI.warn(`Multiple listings for repository "${name}"`);
    } else if(!UI.validName(name)) {
      UI.warn(`Invalid name for repository "${name}"`);
    } else {
      r = new Repository(name, can_store);
      this.repositories.push(r);
      this.repository_index = this.repositories.length - 1;
      r.getModuleList();
    }
    return r;
  }
  
  removeRepository() {
    // Removes selected repository from list.
    // NOTE: Do not remove the first item (local host).
    if(this.repository_index < 1) return;
    fetch('repo/', postData({
          action: 'remove',
          repo: this.repositories[this.repository_index].name
        }))
      .then((response) => {
          if(!response.ok) {
            UI.alert(`ERROR ${response.status}: ${response.statusText}`);
          }
          return response.text();
        })
      .then((data) => {
          if(data !== this.repositories[this.repository_index].name) {
            UI.alert('ERROR: ' + data);
          } else {
            this.repositories.splice(this.repository_index, 1);
            this.repository_index = -1;
            this.updateDialog();
          }
        })
      .catch((err) => UI.warn(UI.WARNING.NO_CONNECTION, err));
  }
  
  promptForRepository() {
    // Open "Add repository" dialog (only on local host).
    if(!this.isLocalHost) return;
    this.add_modal.element('name').value = '';
    this.add_modal.element('url').value = '';
    this.add_modal.element('token').value = '';
    this.add_modal.show('name');
  }

  registerRepository() {
    // Check whether URL defines a Linny-R repository, and if so, add it.
    fetch('repo/', postData({
          action: 'add',
          repo: this.add_modal.element('name').value,
          url: this.add_modal.element('url').value,
          token: this.add_modal.element('token').value
        }))
      .then((response) => {
          if(!response.ok) {
            UI.alert(`ERROR ${response.status}: ${response.statusText}`);
          }
          return response.text();
        })
      .then((data) => {
          if(UI.postResponseOK(data) &&
              data === this.add_modal.element('name').value) {
            console.log('Verified URL for', data);
            this.add_modal.hide();
            // NOTE: assume that the token is valid when it is 32 hex digits
            // (so no real validity check on the remote server; this will reveal
            // itself when actually trying to store a model on that server)
            let can_store = '',
                re = /[0-9A-Fa-f]{32}/g;
            if(re.test(this.add_modal.element('token').value)) can_store = '+';
            this.addRepository(data + can_store);
            this.updateDialog();
          }
        })
      .catch((err) => UI.warn(UI.WARNING.NO_CONNECTION, err));
  }
  
  promptForAccess() {
    // Opens "Access repository" dialog for selected repository
    if(this.repository_index >= 0 &&
        document.getElementById('repo-access-btn').classList.contains('enab')) {
      const r = this.repositories[this.repository_index];
      this.access_modal.element('name').innerText = r.name;
      this.access_modal.element('token').value = '';
      this.access_modal.show('token');
    }
  }

  accessRepository() {
    // Sets token for selected repository
    if(this.repository_index < 0) return;
    let r = this.repositories[this.repository_index],
        e = this.access_modal.element('token'),
        t = e.value.trim(),
        re = /[0-9A-Fa-f]{32}/g;
    if(!re.test(t)) {
      UI.warn('Token must be a 32-digit hexadecimal number');
      e.focus();
      return;
    }
    fetch('repo/', postData({action: 'access', repo: r.name, token: t}))
      .then((response) => {
          if(!response.ok) {
            UI.alert(`ERROR ${response.status}: ${response.statusText}`);
          }
          return response.text();
        })
      .then((data) => {
          if(UI.postResponseOK(data, true)) {
            r.authorized = true;
            this.access_modal.hide();
            this.updateDialog();
          }
        })
      .catch((err) => UI.warn(UI.WARNING.NO_CONNECTION, err));
  }
  
  selectRepository() {
    this.repository_index = parseInt(this.repository_selector.value);
    this.module_index = -1;
    if(this.repository_index >= 0) {
      const r = this.repositories[this.repository_index];
      r.getModuleList();
    } else {
      this.updateDialog();
    }
  }

  selectModule(n) {
    // Select module in list; if double-clicked, load it and hide dialog
    if(this.repository_index >= 0) {
      const
          now = Date.now(),
          dt = now - this.last_time_selected;
      this.last_time_selected = now;
      if(n === this.module_index) {
        // Consider click to be "double" if it occurred less than 300 ms ago
        if(dt < 300) {
          this.last_time_selected = 0;
          this.includeModule();
          return;
        }
      }
      this.module_index = n;
    } else {
      this.module_index = -1;
    }
    this.updateModulesTable();
  }

  showInfo(n, shift) {
    if(this.repository_index >= 0) {
      const r = this.repositories[this.repository_index];
      if(n < r.module_names.length) {
        const m = new Module(r.module_names[n]);
        if(shift) {
          // Only get data from server when Shift key is pressed
          r.getModuleInfo(n, m);
        } else {
          // Only update the status line
          DOCUMENTATION_MANAGER.update(m, shift);
        }
      }
    }
  }

  updateModulesTable() {
    // Refresh the module table
    let mcount = 0;
    const trl = [];
    if(this.repository_index >= 0) {
      const r = this.repositories[this.repository_index];
      mcount = r.module_names.length;
      for(let i = 0; i < mcount; i++) {
        const n = r.module_names[i],
              sel = (i === this.module_index ? ' sel-set' : '');
        trl.push('<tr class="module', sel, '" title="',
          n, '" onclick="REPOSITORY_BROWSER.selectModule(', i,
          ');" onmouseover="REPOSITORY_BROWSER.showInfo(\'', i,
          '\', event.shiftKey);">',
          '<td class="v-name">', n, '</td></tr>');
      }
    }
    this.modules_table.innerHTML = trl.join('');
    this.modules_count.innerHTML = pluralS(mcount, 'module');
    if(this.module_index >= 0) {
      UI.enableButtons('repo-load repo-include');
      // NOTE: only allow deletion from local host repository
      if(this.repository_index === 0 && this.isLocalHost) {
        UI.enableButtons(' repo-delete');
      } else {
        UI.disableButtons(' repo-delete');
      }
    } else {  
      UI.disableButtons('repo-load repo-include repo-delete');
    }
  }
  
  updateDialog() {
    // Refreshes all dialog elements
    const ol = [];
    for(let i = 0; i < this.repositories.length; i++) {
      ol.push('<option value="', i,
        (i === this.repository_index ? '"selected="selected' : ''),
        '">', this.repositories[i].name , '</option>');
    }
    this.repository_selector.innerHTML = ol.join('');
    UI.disableButtons('repo-access repo-remove repo-store');
    // NOTE: on remote installation, do not allow add/remove/store
    if(!this.isLocalHost) {
      UI.disableButtons('repo-add');
    } else if(this.repository_index >= 0) {
      const r = this.repositories[this.repository_index];
      if(r.authorized) {
        UI.enableButtons('repo-store');
      } else {
        UI.enableButtons('repo-access');
      }
      if(r.name !== 'local host') {
        // NOTE: cannot remove 'local host'
        UI.enableButtons('repo-remove');
      }
    }
    this.updateModulesTable();
  }

  promptForInclusion(repo, file, node) {
    // Add entities defined in the parsed XML tree with root `node`
    IO_CONTEXT = new IOContext(repo, file, node);
    const md = this.include_modal;
    md.element('name').innerHTML = IO_CONTEXT.file_name;
    md.element('prefix').value = '';
    md.element('actor').value = '';
    md.element('scroll-area').innerHTML = IO_CONTEXT.parameterTable;
    md.show('prefix');
  }
  
  updateActors() {
    // Adds actor (if specified) to model, and then updates the selector options
    // for each actor binding selector
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
    // Returns the selected option (as DOM element) of the the parameter
    // selector identified by its element name (!) in the Include modal
    const lst = document.getElementsByName(name);
    let e = null;
    for(let i = 0; i < lst.length; i++) {
      if(lst[i].type.indexOf('select') === 0) {
        e = lst[i];
        break;
      }
    }
    if(!e) UI.alert(`Parameter selector "${b.id}" not found`);
    return e;
  }
  
  performInclusion() {
    // Includes the selected model as "module" cluster in the model;
    // this is effectuated by "re-initializing" the current model using
    // the XML of the model-to-be-included with the contextualization as
    // indicated by the modeler
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
    // NOTE: prefix must not already be in use as entity name
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
    // NOTE: including may affect focal cluster, so store it...
    const fc = MODEL.focal_cluster;
    MODEL.initFromXML(IO_CONTEXT.xml);
    // ... and restore it afterwards
    MODEL.focal_cluster = fc;
    let counts = `: ${pluralS(IO_CONTEXT.added_nodes.length, 'node')}, ` +
        pluralS(IO_CONTEXT.added_links.length, 'link');
    if(IO_CONTEXT.superseded.length > 0) {
      counts += ` (superseded ${IO_CONTEXT.superseded.length})`;
      console.log('SUPERSEDED:', IO_CONTEXT.superseded);
    }
    UI.notify(`Model <tt>${IO_CONTEXT.file_name}</tt> included from ` +
        `<strong>${IO_CONTEXT.repo_name}</strong>${counts}`);
    // Get the containing cluster
    obj = MODEL.objectByName(IO_CONTEXT.clusterName);
    // Position it in the focal cluster
    if(obj instanceof Cluster) {
      obj.x = IO_CONTEXT.centroid_x;
      obj.y = IO_CONTEXT.centroid_y;
      obj.clearAllProcesses();
    } else {
      UI.alert('Include failed to create a cluster');
    }
    // Reset the IO context
    IO_CONTEXT = null;
    this.include_modal.hide();
    MODEL.cleanUpActors();
    MODEL.focal_cluster.clearAllProcesses();
    UI.drawDiagram(MODEL);
    // Select the newly added cluster
    if(obj) MODEL.select(obj);
    // Update dataset manager if shown (as new datasets may have been added)
    if(DATASET_MANAGER.visible) DATASET_MANAGER.updateDialog();
  }
  
  cancelInclusion() {
    // Clears the IO context and closes the inclusion dialog
    IO_CONTEXT = null;
    this.include_modal.hide();
  }

  promptForStoring() {
    if(this.repository_index >= 0) {
      this.store_modal.element('name').innerText =
          this.repositories[this.repository_index].name;
      this.store_modal.element('model-name').value =
          this.asFileName(MODEL.name);
      this.store_modal.show('model-name');
    }
  }
  
  storeModel() {
    if(this.repository_index >= 0) {
      const
          mn = this.store_modal.element('model-name').value.trim(),
          r = this.repositories[this.repository_index];
      if(mn.length > 1) {
        r.storeModelAsModule(mn);
        this.store_modal.hide();
      }
    }
  }
  
  promptForBlackBoxing() {
    if(this.repository_index >= 0) {
      this.store_bb_modal.element('name').innerText =
          this.repositories[this.repository_index].name;
      this.store_bb_modal.element('model-name').value =
          this.asFileName(MODEL.name);
      this.store_bb_modal.show('model-name');
    }
  }
  
  storeBlackBoxModel() {
    if(this.repository_index >= 0) {
      const
          mn = this.store_bb_modal.element('model-name').value.trim(),
          r = this.repositories[this.repository_index];
      if(mn.length > 1) {
        // NOTE: second parameter indicates: store with "black box XML"
        r.storeModelAsModule(mn, true);
        this.store_bb_modal.hide();
      }
    }
  }
  
  loadModuleAsModel() {
    // Loads selected module as model
    this.confirm_load_modal.hide();
    if(this.repository_index >= 0 && this.module_index >= 0) {
      // NOTE: when loading new model, the stay-on-top dialogs must be reset
      UI.hideStayOnTopDialogs();
      const r = this.repositories[this.repository_index];
      // NOTE: pass FALSE to indicate "no inclusion; load XML as model"
      r.loadModule(this.module_index, false);
    }
  }
  
  includeModule() {
    // Includes selected module into the current model
    if(this.repository_index >= 0 && this.module_index >= 0) {
      const r = this.repositories[this.repository_index];
      r.loadModule(this.module_index, true);
    }
  }

  confirmLoadModuleAsModel() {
    // Prompts modeler to confirm loading the selected module as model
    if(this.repository_index >= 0 && this.module_index >= 0 &&
        document.getElementById('repo-load-btn').classList.contains('enab')) {
      const r = this.repositories[this.repository_index];
      this.confirm_load_modal.element('mod-name').innerText =
          r.module_names[this.module_index];
      this.confirm_load_modal.show();
    }    
  }
  
  confirmDeleteFromRepository() {
    // Prompts modeler to confirm deletion of the selected module
    if(this.repository_index >= 0 && this.module_index >= 0 &&
        document.getElementById('repo-delete-btn').classList.contains('enab')) {
      const r = this.repositories[this.repository_index];
      this.confirm_delete_modal.element('name').innerText = r.name;
      this.confirm_delete_modal.element('mod-name').innerText =
          r.module_names[this.module_index];
      this.confirm_delete_modal.show();
    }
  }
  
  deleteFromRepository() {
    // Deletes the selected modulle from the current repository
    if(this.repository_index >= 0 && this.module_index >= 0) {
      const r = this.repositories[this.repository_index];
      if(r) r.deleteModule(this.module_index);
      this.confirm_delete_modal.hide();
    }
  }
  
}  // END of class GUIRepositoryBrowser

