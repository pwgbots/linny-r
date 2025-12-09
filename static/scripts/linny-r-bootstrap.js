/*
Linny-R is an executable graphical specification language for (mixed integer)
linear programming (MILP) problems, especially unit commitment problems (UCP).
The Linny-R language and tool have been developed by Pieter Bots at Delft
University of Technology, starting in 2009. The project to develop a browser-
based version started in 2017. See https://linny-r.org for more information.

This JavaScript file (linny-r-bootstrap.js) dynamically loads all other
JavaScript files that implement the Linny-R modeling environment. It defines
global variables for the GUI components and makes requests to the local server
to get data on the available solvers, and to check whether a new release of
the Linny-R software is available.
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

// Create global variables
var
  // NODE = false indicates that modules need not export their properties
  NODE = false,
  // Version number
  LINNY_R_VERSION = '0',
  // GitHub repository
  GITHUB_REPOSITORY = 'https://github.com/pwgbots/linny-r',
  // Linny-R server hosting public channels
  PUBLIC_LINNY_R_URL = 'https://sysmod.tbm.tudelft.nl/linny-r',
  // Create the XML parser
  XML_PARSER = new DOMParser(),
  // NOTE: global variables will be initialized when page has loaded
  // The controller object (User Interface)
  UI = null,
  // The current model
  MODEL = null,
  // @@ TO DO: make an IO context STACK to permit nested modules 
  IO_CONTEXT = null,
  // Manager objects that will act as controller and/or viewer
  X_EDIT = null,
  MONITOR = null,
  FILE_MANAGER = null,
  DATASET_MANAGER = null,
  CHART_MANAGER = null,
  EXPERIMENT_MANAGER = null,
  SENSITIVITY_ANALYSIS = null,
  CONSTRAINT_EDITOR = null,
  DOCUMENTATION_MANAGER = null,
  RECEIVER = null,
  // Stack for undo/redo operations
  UNDO_STACK = null,
  // The virtual machine
  VM = null,

// Load audio files
  SOUNDS = {
      notification: new Audio('sounds/notification.wav'),
      warning: new Audio('sounds/warning.wav'),
      error: new Audio('sounds/error.wav')
    };
  
  
function loadLinnyR() {
  // Ensure that the Linny-R HTML and scripts will be the latest version
  // by reloading unless URL contains current time stamp truncated to 10 s.
  const
      d = new Date(),
      // `getTime` returns milliseconds => divide by 10 thousand.
      t = Math.floor(d.getTime() / 10000),
      url = window.location.href;
  if(url.indexOf('?x=' + t) < 0) {
    // Time stamp in URL is missing or not very recent => reload.
    // NOTE: URL may contain user user ID (e-mail address).
    const split = url.split('?u='),
          base = split[0],
          userid = (split.length > 1 ? '&u=' + split[1] : '');
    // NOTE: Remove prior '?x=' cache buster if any, add new time stamp,
    // and then reload.
    window.location.assign(base.split('?x=')[0] + '?x=' + t + userid);
  } else {
    // Load the style sheet.
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.type = 'text/css';
    // Adding the time stamp prevents reloading from the browser cache.
    link.href = 'linny-r.css?x=' + t;
    link.media = 'all';
    document.getElementById('doc-head').appendChild(link);
    // Reload the scripts in their proper sequence, i.e., such that all
    // classes are initialized before their instances are created.
    loadScripts(['-config', '-model', '-ctrl',
        '-gui-paper', '-gui-controller', '-gui-monitor',
        '-gui-file-manager', '-gui-expression-editor',
        '-gui-scale-unit-manager',
        '-gui-power-grid-manager', '-gui-actor-manager',
        '-gui-constraint-editor', '-gui-dataset-manager',
        '-gui-equation-manager', '-gui-chart-manager',
        '-gui-sensitivity-analysis', '-gui-experiment-manager',
        '-gui-documentation-manager', '-gui-finder', '-gui-receiver',
        '-gui-undo-redo', '-vm', '-utils'], t);
  }
}

function loadScripts(sl, t) {
  // Load first script in list `sl` via URL with time stamp `t` added
  // as parameter ?x=t to prevent loading an old version from the browser
  // cache. Repeat this until list `sl` is empty.
  if(sl.length == 0) {
    // Initialize only after all scripts have loaded.
    initializeLinnyR();
  } else {
    const
        s = sl.shift(),
        head = document.getElementById('doc-head'),
        script = document.createElement('script');
    // NOTE: Recursive call after script s has loaded.
    script.onload = () => {
        console.log('Loaded script: linny-r' + s);
        loadScripts(sl, t);
      };
    script.src= 'scripts/linny-r' + s + '.js?x=' + t;
    // Add the script to the DOM tree.
    head.appendChild(script);
  }
}

function checkForUpdates() {
  // Request the server to get the current version number, and check
  // whether a newer release is available.
  fetch('auto-check')
    .then((response) => response.text())
    .then((data) => {
        console.log('Version check:', data);
        const info = data.split('|');
        if(info.length > 1) {
          LINNY_R_VERSION = info[0];
          const v = 'Version ' + LINNY_R_VERSION;
          // Update the "home page" of the documentation manager.
          DOCUMENTATION_MANAGER.about_linny_r =
              DOCUMENTATION_MANAGER.about_linny_r.replace(
                  '[LINNY_R_VERSION]', v);
          // Update the version number in the browser's upper left corner.
          document.getElementById('linny-r-version-number').innerHTML = v;
          // NOTE: Server detects "version 0" when npmjs website was *not*
          // reached. If so, do not suggest that a new version exists.
          if(info[1] !== 'up-to-date' && info[1] !== '0') {
            // Inform user that newer version exists.
            UI.newer_version = info[1];
            let msg = ['<a href="', GITHUB_REPOSITORY,
                '/releases/tag/v', info[1],
                '" title="Click to view version release notes" ',
                'target="_blank">Version <strong>',
                info[1], '</strong></a> released on ',
                info[2].substring(0, 21),' can be installed.'].join('');
            const blinker = UI.check_update_modal.element('manual');
            if(majorNewVersion(LINNY_R_VERSION, info[1])) {
              // Major version requires manual install...
              msg += ['<br><strong>NOTE:</strong> ',
                  'This is a <em>major</em> version change, so automatic ',
                  'updating is <strong>not</strong> possible.<br>',
                  'Please read <a href="', GITHUB_REPOSITORY,
                  '/linny-r#updating-to-the-latest-version-of-linny-r" ',
                  'target="_blank"> this information on GitHub</a> ',
                  ' on how to manually upgrade Linny-R.'].join('');
              // ... so shutdown instead of update...
              UI.removeListeners(UI.check_update_modal.ok)
                  .addEventListener('click', () => UI.shutDownServer());
              // ... and show blinking notification in dialog header.
              blinker.style.display = 'inline-block';
            } else{
              blinker.style.display = 'none';
            }
            UI.check_update_modal.element('msg').innerHTML = msg;
            UI.check_update_modal.show();
            UI.check_update_modal.element('buttons').style.display = 'block';
          }
        } else {
          // Invalid server response (should not occur, but just in case).
          UI.warn('Version check failed: "' + data + '"');
        }
        // Schedule a new check 8 hours from now.
        setTimeout(checkForUpdates, 8*3600000);

      })
    .catch((error) => UI.warn(UI.WARNING.NO_CONNECTION, error));
}

function initializeLinnyR() {
  // Protect user from unintentionally closing the browser.
  // NOTE: Obsolete now that browsers override with own prompt.
  window.onbeforeunload = () => { return 'Exit Linny-R?'; };
  // NOTE: First create UI and Documentation Manager to report messages.
  UI = new GUIController();
  UI.addListeners();
  DOCUMENTATION_MANAGER = new DocumentationManager();
  // Create the virtual machine.
  VM = new VirtualMachine();
  // Create the GUI-only objects.
  UNDO_STACK = new UndoStack();
  X_EDIT = new ExpressionEditor();
  ACTOR_MANAGER = new ActorManager();
  SCALE_UNIT_MANAGER = new ScaleUnitManager();
  POWER_GRID_MANAGER = new PowerGridManager();
  EQUATION_MANAGER = new EquationManager();
  FINDER = new Finder();
  CONSTRAINT_EDITOR = new ConstraintEditor();  
  // NOTE: Instantiate the GUI classes, not their superclasses.
  FILE_MANAGER = new GUIFileManager();
  DATASET_MANAGER = new GUIDatasetManager();
  CHART_MANAGER = new GUIChartManager();
  SENSITIVITY_ANALYSIS = new GUISensitivityAnalysis();
  EXPERIMENT_MANAGER = new GUIExperimentManager();
  MONITOR = new GUIMonitor();
  RECEIVER = new GUIReceiver();
  // Check for software updates only when running on local server.
  // NOTE: Do this *after* GUI elements have been created, as the
  // updater uses a dialog.
  if(!SOLVER.user_id) checkForUpdates();
  // Create a new Linny-R model.
  UI.createNewModel();
  // Connect the virtual machine (may prompt for password).
  MONITOR.connectToServer();
}

