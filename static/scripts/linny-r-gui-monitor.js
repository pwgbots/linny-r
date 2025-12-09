/*
Linny-R is an executable graphical specification language for (mixed integer)
linear programming (MILP) problems, especially unit commitment problems (UCP).
The Linny-R language and tool have been developed by Pieter Bots at Delft
University of Technology, starting in 2009. The project to develop a browser-
based version started in 2017. See https://linny-r.org for more information.

This JavaScript file (linny-r-gui-monitor.js) provides the GUI functionality
for the Linny-R Monitor dialog.

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

// CLASS GUIMonitor provides the GUI for the Virtual Machine, and handles
// the interaction with the MILP solver via POST requests to the server.
// NOTE: because the console-only monitor requires Node.js modules, this
// GUI class does NOT extend its console-only counterpart
class GUIMonitor {
  constructor() {
    this.console = false;
    this.visible = false;
    // The "shown" flag is used to prevent re-display of the call stack
    this.call_stack_shown = false;
    // Initialize related DOM elements
    this.dialog = UI.draggableDialog('monitor');
    UI.resizableDialog('monitor', 'MONITOR');
    this.close_btn = document.getElementById('monitor-close-btn');
    this.timer = document.getElementById('monitor-timer');
    this.messages_tab = document.getElementById('monitor-msg-tab');
    this.messages_text = document.getElementById('monitor-msg');
    this.variables_tab = document.getElementById('monitor-vbl-tab');
    this.variables_text = document.getElementById('monitor-vbl');
    this.equations_tab = document.getElementById('monitor-eqs-tab');
    this.equations_text = document.getElementById('monitor-eqs');
    this.progress_bar = document.getElementById('monitor-progress-bar');

    // Make toolbar buttons responsive
    this.close_btn.addEventListener(
        'click', (event) => UI.toggleDialog(event));
    this.messages_tab.addEventListener(
        'click', () => MONITOR.updateContent('msg'));
    this.variables_tab.addEventListener(
        'click', () => MONITOR.updateContent('vbl'));
    this.equations_tab.addEventListener(
        'click', () => MONITOR.updateContent('eqs'));

    // Make close button of call stack dialog responsive
    document.getElementById('call-stack-close-btn').addEventListener(
      'click', () => MONITOR.hideCallStack());
    
    this.shown_block = 0;
    // Initially show the messages textarea
    this.tab = 'vbl';
    this.updateContent('msg');
  }
  
  reset() {
    this.shown_block = 0;
    this.last_message_block = 0;
    // Clear monitor's text areas
    this.messages_text.value = '';
    this.variables_text.value = '';
    this.equations_text.value = '';
    // Clear the progress bar
    while(this.progress_bar.firstChild) {
      this.progress_bar.removeChild(this.progress_bar.lastChild);
    }
    this.updateContent('msg');
  }

  updateMonitorTime() {
    // Displays the elapsed time since last reset as (hrs:)mins:secs
    let td = (new Date().getTime() - VM.reset_time) / 1000,
        hrs = Math.floor(td / 3600);
    if(hrs > 0) {
      td -= hrs * 3600;
      hrs += ':';
    } else {
      hrs = '';
    }
    const
        min = Math.floor(td / 60),
        sec = Math.round(td - 60*min),
        t = ('0' + min).slice(-2) + ':' + ('0' + sec).slice(-2);
    this.timer.textContent = hrs + t;
  }
  
  updateBlockNumber(bwr) {
    // Display progres as block number (with round) / number of blocks
    document.getElementById('monitor-blocks').innerText =
        bwr + '/' + VM.nr_of_blocks;
  }
  
  clearProgressBar() {
    // Clear the progress bar
    while(this.progress_bar.firstChild) {
      this.progress_bar.removeChild(this.progress_bar.lastChild);
    }
  }

  addProgressBlock(b, err, time) {
    // Adds a block to the progress bar, and updates the relative block lengths
    let total_time = 0;
    for(let i = 0; i < b; i++) total_time += VM.solver_times[i];
    const
        n = document.createElement('div'),
        ssecs = VM.solver_secs[b - 1];
    n.classList.add('progress-block');
    if(err) n.classList.add('error-pb');
    if(b % 2 == 0) n.classList.add('even-pb');
    n.setAttribute('title',
        `Block #${b} took ${time.toPrecision(3)} seconds` +
            (ssecs ? `\n(solver: ${ssecs} seconds)` : ''));
    n.setAttribute('data-blk', b); 
    n.addEventListener('click',
        (event) => {
            const el = event.target;
            el.classList.add('sel-pb');
            MONITOR.showBlock(el.dataset.blk);
          },
        false);
    this.progress_bar.appendChild(n);
    this.progress_bar.style.width =
        Math.floor(100 * b / VM.nr_of_blocks) + '%';
    const cn = this.progress_bar.childNodes;
    if(cn && this.shown_block > 0 && this.shown_block <= cn.length) {
      cn[this.shown_block - 1].classList.add('sel-pb');
    }
    for(let i = 0; i < cn.length; i++) {
      cn[i].style.width =
          (Math.floor(10000 * VM.solver_times[i] / total_time) / 100) + '%';
    }
  }
  
  showBlock(b) {
    this.shown_block = b;
    const cn = this.progress_bar.childNodes;
    for(const n of cn) n.classList.remove('sel-pb');
    cn[b - 1].classList.add('sel-pb');
    this.updateContent(this.tab);
  }

  updateDialog() {
    // Implements default behavior for a draggable/resizable dialog.
    this.updateContent(this.tab);
  }
  
  updateContent(tab) {
    // Get the block being computed
    this.block_count = VM.block_count;
    // Shows the appropriate text in the monitor's textarea
    let b = this.shown_block;
    // By default, show information on the block being calculated.
    if(b === 0) b = this.block_count;
    // Legend to variables is not block-dependent.
    this.variables_text.value = VM.variablesLegend();
    if(this.block_count === 0) {
      this.messages_text.value = VM.no_messages;
      this.equations_text.value = VM.no_equations;
    } else if(b <= VM.messages.length) {
      this.messages_text.value = VM.messages[b - 1];
      let eqs = VM.equations[b - 1];
      for(const k in VM.variables_dictionary) if(VM.variables_dictionary.hasOwnProperty(k)) {
        eqs = eqs.replaceAll(k, VM.variables_dictionary[k]);
      }
      this.equations_text.value = eqs;
    }
    // Show the text area for the selected tab.
    if(this.tab !== tab) {
      let mt = 'monitor-' + this.tab;
      document.getElementById(mt).style.display = 'none';
      document.getElementById(mt + '-tab').classList.remove('sel-tab');
      this.tab = tab;
      mt = 'monitor-' + this.tab;
      document.getElementById(mt).style.display = 'block';
      document.getElementById(mt + '-tab').classList.add('sel-tab');
    }
  }

  showCallStack(t) {
    // Show the error message in the dialog header.
    // NOTE: Prevent showing again when VM detects multiple errors.
    if(this.call_stack_shown) return;
    const
        csl = VM.call_stack.length,
        top = VM.call_stack[csl - 1],
        err = top.vector[t],
        // Make separate lists of variable names and their expressions.
        vlist = [],
        xlist = [];
    document.getElementById('call-stack-error').innerHTML =
        `ERROR at t=${t}: ` + VM.errorMessage(err);
    for(const x of VM.call_stack) {
      // For equations, only show the attribute.
      const ons = (x.object === MODEL.equations_dataset ?
          (x.attribute.startsWith(':') ? x.method_object_prefix : '') :
              x.object.displayName + '|');
      vlist.push(ons + x.attribute);
      // Trim spaces around all object-attribute separators in the expression.
      xlist.push(x.text.replace(/\s*\|\s*/g, '|'));
    }
    // Highlight variables where they are used in the expressions.
    const vcc = UI.chart_colors.length;
    for(let i = 0; i < xlist.length; i++) {
      for(let j = 0; j < vlist.length; j++) {
        // Ignore selectors, as these may be different per experiment.
        const
            vnl = vlist[j].split('|'),
            sel = (vnl.length > 1 ? vnl.pop() : ''),
            attr = (VM.attribute_names[sel] ? '|' + sel : ''),
            vn = vnl.join() + attr,
            vnc = '<span style="font-weight: 600; color: ' +
                `${UI.chart_colors[j % vcc]}">${vn}</span>`;
        xlist[i] = xlist[i].split(vn).join(vnc);
      }
    }
    // Then also color the variables.
    for(let i = 0; i < vlist.length; i++) {
      vlist[i] = '<span style="font-weight: 600; color: ' +
        `${UI.chart_colors[i % vcc]}">${vlist[i]}</span>`;
    }
    // Start without indentation.
    let pad = 0;
    // First show the variable being computed.
    const tbl = ['<div>', vlist[0], '</div>'];
    // Then iterate upwards over the call stack.
    for(let i = 0; i < vlist.length - 1; i++) {
      // Show the expression, followed by the next computed variable.
      tbl.push(['<div class="call-stack-row" style="padding-left: ',
        pad, 'px"><div class="call-stack-expr">', xlist[i],
        '</div><div class="call-stack-vbl">&nbsp;\u2937', vlist[i + 1],
        '</div></div>'].join(''));
      // Increase indentation
      pad += 8;
    }
    // Show the last expression, highlighting the array-out-of-bounds (if any).
    let last_x = xlist[xlist.length - 1],
        anc = '';
    if(VM.out_of_bounds_array) {
      anc = '<span style="font-weight: 600; color: red">' +
          VM.out_of_bounds_array + '</span>';
      last_x = last_x.split(VM.out_of_bounds_array).join(anc);
    }
    tbl.push('<div class="call-stack-expr" style="padding-left: ' +
        `${pad}px">${last_x}</div>`);
    // Add index-out-of-bounds message if appropriate.
    if(anc) {
      tbl.push('<div style="color: gray; margin-top: 8px; font-size: 10px">',
          VM.out_of_bounds_msg.replace(VM.out_of_bounds_array, anc), '</div>');
    }
    // Dump the code for the last expression to the console.
    console.log('Code for', top.text, top.code);
    // Show the call stack dialog.
    document.getElementById('call-stack-table').innerHTML = tbl.join('');
    document.getElementById('call-stack-modal').style.display = 'block';
    this.call_stack_shown = true;    
  }

  hideCallStack() {
    document.getElementById('call-stack-modal').style.display = 'none';
    this.call_stack_shown = false;    
  }

  logMessage(block, msg) {
    // Append a solver message to the monitor's messages textarea
    if(this.messages_text.value === VM.no_messages) {
      // Erase the "(no messages)" if still showing.
      this.messages_text.value = '';
    }
    if(this.shown_block === 0 && block !== this.last_message_block) {
      // Clear text area when starting with new block while no block selected.
      this.last_message_block = block;
      this.messages_text.value = '';      
    }
    // NOTE: `msg` is appended only if no block has been selected by
    // clicking on the progress bar, or if the message belongs to the
    // selected block.
    if(this.shown_block === 0 || this.shown_block === block) {
      this.messages_text.value += msg + '\n';
    }
  }
  
  logOnToServer(usr, pwd) {
    VM.solver_user = usr;
    fetch('solver/', postData({action: 'logon', user: usr, password: pwd}))
      .then(UI.fetchText)
      .then((data) => {
          let jsr;
          try {
            jsr = JSON.parse(data);
          } catch(err) {
            console.log('ERROR while parsing JSON:', err);
            UI.alert('ERROR: Unexpected data from server: ' +
                ellipsedText(data));
            return;
          }
          if(jsr.error) {
            UI.alert(jsr.error);
          } else if(jsr.server) {
            VM.solver_token = jsr.token;
            VM.selectSolver(jsr.solver);
            VM.solver_list = jsr.solver_list;
            // Remote solver may indicate user-specific solver time limit.
            let utl = '';
            if(jsr.time_limit) {
              VM.max_solver_time = jsr.time_limit;
              utl = ` -- ${VM.solver_names[VM.solver_id]} solver: ` +
                  `max. ${VM.max_solver_time} seconds per block`;
              // If user has a set time limit, no restrictions on tableau size.
              VM.max_tableau_size = 0;
            }
            UI.notify('Logged on to ' + jsr.server + utl);
            // Load model if one is specified in browser local storage.
            FILE_MANAGER.loadInitialModel();
          } else {
            UI.warn('Authentication failed -- NOT logged on to server -- ' +
                'Click <a href="solver/?action=password">' +
                '<strong>here</strong></a> to change password');
          }
        })
      .catch(UI.fetchCatch);
  }

  connectToServer() {
    // Prompt for credentials if not connected yet.
    // NOTE: No authentication prompt if SOLVER.user_id in `linny-r-config.js`.
    // is left blank.
    if(!VM.solver_user) {
      VM.connected = false;
      VM.solver_token = 'local host';
      fetch('solver/', postData({
            action: 'logon',
            solver: MODEL.preferred_solver || VM.solver_id}))
        .then(UI.fetchText)
        .then((data) => {
            try {
              const
                  jsr = JSON.parse(data),
                  sname = VM.solver_names[jsr.solver] || 'unknown',
                  svr = `Solver on ${jsr.server} is ${sname}`;
              if(jsr.solver !== VM.solver_id) UI.notify(svr);
              VM.server = jsr.server;
              VM.working_directory = jsr.path;
              VM.user_name = jsr.user_name;
              VM.selectSolver(jsr.solver);
              VM.solver_list = jsr.solver_list;
              document.getElementById('host-logo').title  = svr;
              VM.connected = true;
              // NOTE: The server also passes properties for the File manager.
              FILE_MANAGER.separator = jsr.separator;
              FILE_MANAGER.setAutoSaveSettings(jsr.autosave);
              // When user has saved custom default settings, these will be
              // passed by the server as well.
              if(jsr.defaults) {
                for(const k of Object.keys(jsr.defaults)) {
                  CONFIGURATION[k] = jsr.defaults[k];
                }
                // NOTE: The blank model that is created when Linny-R is started
                // in a browser will not have these custom defaults, hence this
                // "overwrite" when the model has just been created (< 300 ms ago).
                if(new Date() - MODEL.time_created < 300) {
                  // NOTE: Author names should not contain potential path delimiters.
                  MODEL.author = (CONFIGURATION.user_name || VM.user_name)
                      .replaceAll(/\\|\//g, '');
                  MODEL.time_scale = CONFIGURATION.default_time_scale;
                  MODEL.time_unit = CONFIGURATION.default_time_unit;
                  MODEL.currency_unit = CONFIGURATION.default_currency_unit;
                  MODEL.default_unit = CONFIGURATION.default_scale_unit;
                  MODEL.decimal_comma = CONFIGURATION.decimal_comma;
                  MODEL.show_notices = CONFIGURATION.slight_slack_notices;
                  // Load model if one is specified in browser local storage.
                  FILE_MANAGER.loadInitialModel();
                }
              }
            } catch(err) {
              console.log(err, data);
              UI.alert('ERROR: Unexpected data from server: ' +
                  ellipsedText(data));
              return;
            }
          })
        .catch(UI.fetchCatch);
    }
    if(VM.solver_token) return true;
    UI.loginPrompt();
    return false;
  }

  submitBlockToSolver() {
    // Post MILP model plus relevant metadata to the server.
    let top = MODEL.timeout_period;
    if(VM.max_solver_time && top > VM.max_solver_time) {
      top = VM.max_solver_time;
      UI.notify('Solver time limit for this server is ' +
          VM.max_solver_time + ' seconds');
    }
UI.logHeapSize(`BEFORE creating post data`);
    const
        bwr = VM.blockWithRound,
        pd = postData({
            action: 'solve',
            user: VM.solver_user,
            token: VM.solver_token,
            block: VM.block_count,
            round: VM.round_sequence[VM.current_round],
            columns: VM.columnsInBlock,
            data: VM.lines,
            solver: MODEL.preferred_solver,
            diagnose: MODEL.always_diagnose,
            timeout: top,
            inttol: MODEL.integer_tolerance,
            mipgap: MODEL.MIP_gap
          });
UI.logHeapSize(`AFTER creating post data`);
    // Immediately free the memory taken up by VM.lines.
    VM.lines = '';
    UI.logHeapSize(`BEFORE submitting block #${bwr} to solver`);
    fetch('solver/', pd)
      .then((response) => {
          if(!response.ok) {
            const msg = `ERROR ${response.status}: ${response.statusText}`;
            VM.logMessage(VM.block_count, msg);
            UI.alert(msg);
          }
          return response.text();
        })
      .then((data) => {
          try {
            VM.processServerResponse(JSON.parse(data));
            UI.logHeapSize('After processing results for block #' + this.block_count);
            // If no errors, solve next block (if any).
            // NOTE: Use setTimeout so that this calling function returns,
            // and browser can update its DOM to display progress.
            setTimeout(() => VM.solveBlocks(), 1);
          } catch(err) {
            // Log details on the console.
            console.log('ERROR while parsing JSON:', err);
            console.log(data);
            // Pass summary on to the browser.
            const msg = 'ERROR: Unexpected data from server: ' +
                ellipsedText(data);
            this.logMessage(this.block_count, msg);
            UI.alert(msg);
            VM.stopSolving();
            return;
          }
        })
      .catch((err) => {
          console.log('ERROR on POST:', err);
          const msg = 'SERVER ERROR: ' + ellipsedText(err.toString());
          VM.logMessage(VM.block_count, msg);
          UI.alert(msg);
          VM.stopSolving();
        });
    pd.body = '';
UI.logHeapSize(`after calling FETCH and clearing POST data body`);
    VM.logMessage(VM.block_count,
        `POSTing block #${bwr} took ${VM.elapsedTime} seconds.`);
    UI.logHeapSize(`AFTER posting block #${bwr} to solver`);
  }
  
} // END of class GUIMonitor
