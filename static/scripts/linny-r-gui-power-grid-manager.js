/*
Linny-R is an executable graphical specification language for (mixed integer)
linear programming (MILP) problems, especially unit commitment problems (UCP).
The Linny-R language and tool have been developed by Pieter Bots at Delft
University of Technology, starting in 2009. The project to develop a browser-
based version started in 2017. See https://linny-r.org for more information.

This JavaScript file (linny-r-gui-power-grid-manager.js) provides the GUI
functionality for the Linny-R Power Grid Manager dialog.

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

// CLASS PowerGridManager (modal dialog!)
class PowerGridManager {
  constructor() {
    // Add the power grids modal
    this.dialog = new ModalDialog('power-grids');
    this.dialog.close.addEventListener('click',
        () => POWER_GRID_MANAGER.closeDialog());
    // Make the add, edit and delete buttons of this modal responsive
    this.dialog.element('new-btn').addEventListener('click',
        () => POWER_GRID_MANAGER.promptForPowerGrid());
    this.dialog.element('edit-btn').addEventListener('click',
        () => POWER_GRID_MANAGER.editPowerGrid());
    this.dialog.element('delete-btn').addEventListener('click',
        () => POWER_GRID_MANAGER.deletePowerGrid());
    // Add the power grid definition modal
    this.new_power_grid_modal = new ModalDialog('new-power-grid');
    this.new_power_grid_modal.ok.addEventListener(
        'click', () => POWER_GRID_MANAGER.addNewPowerGrid());
    this.new_power_grid_modal.cancel.addEventListener(
        'click', () => POWER_GRID_MANAGER.new_power_grid_modal.hide());
    this.scroll_area = this.dialog.element('scroll-area');
    this.table = this.dialog.element('table');
    // Properties used to infer the cyle basis used by the Virtual Machine
    // to add constraints that enforce Kirchhoff's voltage law.
    this.nodes = {};
    this.edges = {};
    this.spanning_tree = [];
    this.tree_incidence = {};
    this.cycle_edges = [];
    this.cycle_basis = [];
    this.min_length = 0;
    this.max_length = 0;
    this.total_length = 0;
    this.messages = [];
  }
  
  get sortedGridIDs() {
    // Return list of grid Ids that sort grids by (1) voltage and (2) name.
    function kVnSort(a, b) {
      const
          pga = MODEL.power_grids[a],
          pgb = MODEL.power_grids[b];
      // NOTE: Highest voltage comes first.
      if(pga.kilovolts > pgb.kilovolts) return -1;
      if(pga.kilovolts < pgb.kilovolts) return 1;
      // Names are sorted alphabetically.
      return pga.name.localeCompare(pgb.name);
    }
    return Object.keys(MODEL.power_grids).sort(kVnSort);
  }
  
  updateGridMenu(modal) {
    // Create inner HTML for a menu with voltages and names as title.
    // The parameter `modal` identifies the modal for which this menu
    // is generated. Th e selected plate will then be shown in the DIV
    // identified by "`modal`-grid-plate".
    const menu = UI.modals[modal].element('grid-plate-menu');
    if(menu) {
      const
          html = [],
          grids = this.sortedGridIDs;
      html.push('<div id="', modal, '-gm-none" class="no-grid-plate" ',
          'title="No grid element" onclick="UI.setGridPlate(event.target)">',
          '(&#x21AF;)</div>');
      for(const g of grids) {
        const pg = MODEL.power_grids[g];
        html.push('<div id="', modal, '-gm-', pg.id,
            '"class="menu-plate" style="background-color: ', pg.color,
            '" title="Element of grid &ldquo;', pg.name,
            '&rdquo;" onclick="UI.setGridPlate(event.target);">',
            pg.voltage, '</div>');
      }
      menu.innerHTML = html.join('');
    }
  }

  show() {
    // Show the power grids for the current model.
    // NOTE: Add/edit/delete actions operate on this list, so changes
    // take immediate effect.
    // NOTE: Power grid objects have a unique abstract identifier.
    this.selected_grid = '';
    this.last_time_selected = 0;
    this.updateDialog();
    this.dialog.show();
  }
  
  updateDialog() {
    // Create the HTML for the power grids table and update the state
    // of the action buttons.
    if(!MODEL.power_grids.hasOwnProperty(this.selected_grid)) {
      this.selected_grid = '';
    }
    const
        keys = this.sortedGridIDs,
        sl = [],
        ss = this.selected_grid;
    let ssid = 'scntr';
    if(!keys.length) {
      sl.push('<tr><td><em>No grids defined</em></td></tr>');
    } else {
      for(let i = 0; i < keys.length; i++) {
        const
            s = keys[i],
            clk = '" onclick="POWER_GRID_MANAGER.selectPowerGrid(event, \'' +
                s + '\'',
            pg = MODEL.power_grids[s];
        if(s === ss) ssid += i;
        sl.push(['<tr id="scntr', i, '" class="dataset-modif',
            (s === ss ? ' sel-set' : ''),
            '"><td class="dataset-selector', clk, ');">',
            '<div class="grid-kV-plate" style="background-color: ',
            pg.color, '">', pg.voltage, '</div>',
            '<div class="grid-watts">', pg.power_unit, '</div>',
            (pg.kirchhoff ?
                '<div class="grid-kvl-symbol">&#x27F3;</div>': ''),
            (pg.loss_approximation ?
                '<div class="grid-loss-symbol">L&sup' +
                pg.loss_approximation + ';</div>' : ''),
            '</div>', pg.name, '</td></tr>'].join(''));
      }
    }
    this.table.innerHTML = sl.join('');
    UI.setBox('power-grids-capacity', MODEL.ignore_grid_capacity);
    UI.setBox('power-grids-KVL', MODEL.ignore_KVL);
    UI.setBox('power-grids-losses', MODEL.ignore_power_losses);
    if(ss) UI.scrollIntoView(document.getElementById(ssid));
    const btns = 'power-grids-edit power-grids-delete';
    if(ss) {
      UI.enableButtons(btns);
    } else {
      UI.disableButtons(btns);
    }
  }
  
  closeDialog() {
    // Save checkbox status and hide the dialog.
    MODEL.ignore_grid_capacity = UI.boxChecked('power-grids-capacity');
    MODEL.ignore_KVL = UI.boxChecked('power-grids-KVL');
    MODEL.ignore_power_losses = UI.boxChecked('power-grids-losses');
    this.dialog.hide();
    const pg_btn = document.getElementById('settings-power-btn');
    if(MODEL.ignore_grid_capacity || MODEL.ignore_KVL || MODEL.ignore_power_losses) {
      pg_btn.classList.add('ignore');
    } else {
      pg_btn.classList.remove('ignore');
    }
  }

  selectPowerGrid(event, id, focus) {
    // Select power grid, and when double-clicked, allow to edit it.
    const
        ss = this.selected_grid,
        now = Date.now(),
        dt = now - this.last_time_selected,
        // NOTE: Alt-click and double-click indicate: edit.
        // Consider click to be "double" if the same modifier was clicked
        // less than 300 ms ago.
        edit = event.altKey || (id === ss && dt < 300);
    this.selected_grid = id;
    this.last_time_selected = now;
    if(edit) {
      this.last_time_selected = 0;
      this.promptForPowerGrid('Edit', focus);
      return;
    }
    this.updateDialog();
  }
  
  promptForPowerGrid(action='Define new', focus='name') {
    // Show the Add/Edit power grid dialog for the indicated action. 
    const md = this.new_power_grid_modal;
    md.element('action').innerText = action;
    let pg;
    if(action === 'Edit' && this.selected_grid) {
      pg = MODEL.power_grids[this.selected_grid];
    } else {
      // Use a dummy object to obtain default properties.
      pg = new PowerGrid('');
    }
    md.element('name').value = pg.name;
    md.element('voltage').value = pg.kilovolts;
    md.element('color').value = pg.color;
    md.element('unit').value = pg.power_unit;
    UI.setBox('grid-kirchhoff', pg.kirchhoff);
    md.element('losses').value = pg.loss_approximation;
    this.new_power_grid_modal.show(focus);
  }

  addNewPowerGrid() {
    // Add the new power grid or update the one being edited. 
    const
        md = this.new_power_grid_modal,
        edited = md.element('action').innerText === 'Edit',
        n = UI.cleanName(md.element('name').value);
    if(!n) {
      // Do not accept empty string as name
      UI.warn('Power grid must have a name');
      md.element('name').focus();
      return;
    }
    let pg = MODEL.powerGridByName(n);
    if(pg && !edited) {
      // Do not accept name of existing grid as name for new grid.
      UI.warn(`Power grid "${pg.name}" is already defined`);
      md.element('name').focus();
      return;      
    }
    const
        e = md.element('voltage'),
        kv = safeStrToFloat(e.value, 0);
    if(kv <= 0 || kv > 5000) {
      UI.warn(`Voltage must be positive (up to 5 MV)`);
      e.focus();
      return;      
    }
    pg = (edited ? MODEL.powerGridByID(this.selected_grid) :
        MODEL.addPowerGrid(randomID()));
    pg.name = n;
    pg.kilovolts = kv;
    pg.color = md.element('color').value;
    pg.power_unit = md.element('unit').value;
    pg.kirchhoff = UI.boxChecked('grid-kirchhoff'); 
    pg.loss_approximation = parseInt(md.element('losses').value);
    md.hide();
    this.updateDialog();
  }
  
  editPowerGrid() {
    // Allow user to edit name and/or value.
    if(this.selected_grid) this.promptForPowerGrid('Edit');
  }
  
  deletePowerGrid() {
    // Allow user to delete, but warn if some processes are labeled as
    // part of this power grid.
    if(this.selected_grid) {
      // @@@TO DO: check whether grid is used in the model.
      // If so, ask user to confirm to remove grid property from all
      // process elements having this grid.
      delete MODEL.power_grids[this.selected_grid];
      this.updateDialog();
    }
  }
  
  checkLengths() {
    // Calculate length statistics for all grid processes.
    this.min_length = 1e+10;
    this.max_length = 0;
    this.total_length = 0;
    for(let k in MODEL.processes) if(MODEL.processes.hasOwnProperty(k)) {
      const p = MODEL.processes[k];
      // NOTE: Do not include processes in clusters that should be ignored.
      if(p.grid && !MODEL.ignored_entities[p.identifier]) {
        this.min_length = Math.min(p.length_in_km, this.min_length);
        this.max_length = Math.max(p.length_in_km, this.max_length);
        this.total_length += p.length_in_km;
      }
    }
  }
  
  inferNodesAndEdges() {
    // Infer graph structure of combined power grids for which losses
    // and/or Kirchhoff's voltage law must be enforced.
    this.nodes = {};
    this.edges = {};
    this.messages.length = 0;
    // NOTE: Recalculate length statistics now only for "real" grid edges.
    this.min_length = 1e+10;
    this.max_length = 0;
    this.total_length = 0;
    let link_delays = 0;
    for(let k in MODEL.processes) if(MODEL.processes.hasOwnProperty(k)) {
      const p = MODEL.processes[k];
      // NOTE: Do not include processes in clusters that should be ignored.
      if(p.grid && !MODEL.ignored_entities[p.identifier]) {
        const mlmsg = [];
        let fn = null,
            tn = null;
        for(const l of p.inputs) {
          if(l.multiplier === VM.LM_LEVEL &&
              !MODEL.ignored_entities[l.identifier]) {
            if(fn) {
              mlmsg.push('more than 1 input');
            } else {
              fn = l.from_node;
            }
          }
        }
        if(!fn) mlmsg.push('no inputs');
        for(const l of p.outputs) {
          if(l.multiplier === VM.LM_LEVEL &&
              !MODEL.ignored_entities[l.identifier]) {
            if(tn) {
              mlmsg.push('more than 1 output');
            } else {
              tn = l.to_node;
            }
          }
        }
        if(!tn) mlmsg.push('no outputs');
        if(mlmsg.length) {
          // Process is not linked as a grid element.
          this.messages.push(VM.WARNING + ' Grid process "' +
              p.displayName + '" has ' + mlmsg.join(' and '));
        } else {
          // Check whether the output link has a delay; this will be ignored.
          const delay = p.outputs[0].flow_delay;
          if(delay.defined && delay.text !== '0') link_delays++;
          // Add FROM node and TO node to graph.
          const
              fnid = fn.identifier,
              tnid = tn.identifier,
              edge = {process: p, from_node: fnid, to_node: tnid};
          // NOTE: Key uniqueness ensures that nodes are unique.
          this.nodes[fnid] = fn;
          this.nodes[tnid] = tn;
          // Add edge to graph, identified by its process ID.
          this.edges[p.identifier] = edge;
          this.min_length = Math.min(p.length_in_km, this.min_length);
          this.max_length = Math.max(p.length_in_km, this.max_length);
          this.total_length += p.length_in_km;
        }
      }
    }
    if(link_delays > 0) this.messages.push(
        `${VM.WARNING} ${pluralS(link_delays, 'link delay')} will be ignored`);
    var ecnt = Object.keys(this.edges).length,
        grid = [pluralS(Object.keys(this.nodes).length, 'node'),
            pluralS(ecnt, 'edge'), `total length: ${this.total_length} km`];
    if(!ecnt) {
      this.min_length = 0;
    } else if(ecnt > 1) {
      grid.push(`range: ${this.min_length} - ${this.max_length} km`);
    }
    this.messages.push('Overall power grid comprises ' +
        grid.join(', ').toLowerCase());
  }
  
  inferSpanningTree() {
    // Use Kruksal's algorithm to build spanning tree.
    // NOTE: Tree needs not be minimal, so edges are not sorted.
    this.spanning_tree.length = 0;
    this.cycle_edges.length = 0;
    this.tree_incidence = {};
    const node_set = {};
    for(let k in this.edges) if(this.edges.hasOwnProperty(k)) {
      const
          edge = this.edges[k],
          efn = edge.from_node,
          etn = edge.to_node,
          kvl = edge.process.grid.kirchhoff,
          fn_in_tree = node_set.hasOwnProperty(efn),
          tn_in_tree = node_set.hasOwnProperty(etn);
      // Only add edges of grids for which Kirchhoff's voltage law
      // has to be enforced.
      if(kvl) {
        if(fn_in_tree && tn_in_tree) {
          // Edge forms a cycle, so add it to the cycle edge list.
          this.cycle_edges.push(edge);
        } else {
          // Edge is not incident with *two* nodes already in the tree, so
          // add it to the tree.
          this.spanning_tree.push(edge);
          node_set[efn] = true;
          node_set[etn] = true;
        }
        const ti = this.tree_incidence;
        // Always record that both its nodes are incident with it.
        if(ti.hasOwnProperty(efn)) {
          ti[efn].push(edge);
        } else {
          ti[efn] = [edge];
        }
        if(ti.hasOwnProperty(etn)) {
          ti[etn].push(edge);
        } else {
          ti[etn] = [edge];
        }
      }
    }
  }
  
  pathInSpanningTree(fn, tn, path) {
    // Recursively constructs `path` as the list of edges forming the path
    // from `fn` to `tn` in the spanning tree of this grid.
    // If edge connects path with TO node, `path` is complete.
    if(fn === tn) return true;
    for(const e of this.tree_incidence[fn]) {
      // Ignore edges already in the path.
      if(path.indexOf(e) < 0) {
        // NOTE: Edges are directed, but should not be considered as such.
        const nn = (e.from_node === fn ? e.to_node : e.from_node);
        path.push(e);
        if(this.pathInSpanningTree(nn, tn, path)) return true;
        path.pop();
      }
    }
    return false;
  }
  
  inferCycleBasis() {
    // Construct the list of fundamental cycles in the network.
    this.cycle_basis.length = 0;
    if(!(MODEL.with_power_flow && MODEL.powerGridsWithKVL.length)) return;
    this.inferNodesAndEdges();
    this.inferSpanningTree();
    for(const edge of this.cycle_edges) {
      const path = [];
      if(this.pathInSpanningTree(edge.from_node, edge.to_node, path)) {
        // Add flags that indicate whether the edge on the path is reversed.
        // The closing edge determines the orientation.
        const cycle = [{process: edge.process, orientation: 1}];
        let node = edge.to_node;
        for(let i = path.length - 1; i >= 0; i--) {
          const
              pe = path[i],
              ce = {process: pe.process};
          if(pe.from_node === node) {
            ce.orientation = 1;
            node = pe.to_node;
          } else {
            ce.orientation = -1;
            node = pe.from_node;
          }
          cycle.push(ce);
        }
        this.cycle_basis.push(cycle);
      }
    }
  }
  
  get cycleBasisAsString() {
    // Return description of cycle basis.
    const ll = [pluralS(this.cycle_basis.length, 'fundamental cycle') + ':'];
    for(let i = 0; i < this.cycle_basis.length; i++) {
      const
          c = this.cycle_basis[i],
          l = [];
      for(const e of c) {
        l.push(`${e.process.displayName} [${e.orientation > 0 ? '+' : '-'}]`);
      }
      ll.push(`(${i + 1}) ${l.join(', ')}`);
    }
    return ll.join('\n');
  }

  cycleFlowTable(c) {
    // Return flows through cycle `c` as an HTML table.
    if(!MODEL.solved) return '';
    const html = ['<table class="power-flow">',
        '<tr><th colspan="2">Grid process</th>' +
        '<th title="Reactance"><em>x</em></th><th title="Power">P</th>' +
        '<th><em>x</em>P</th></tr>'];
    let sum = 0;
    for(const edge of c) {
      const
          p = edge.process,
          x = p.length_in_km * p.grid.reactancePerKm,
          l = p.actualLevel(MODEL.t);
      html.push(`<tr><td title="${p.gridEdge}">${p.displayName}</td>` + 
          `</td><td>[${edge.orientation > 0 ? '&plus;' : '&minus;'}]</td>` +
          `<td>${(Math.round(x * 10000) / 10000).toFixed(4)}</td>` +
          `<td>${VM.sig4Dig(l)}</td>` +
          `<td>${(x * l).toFixed(2)}</td></tr>`);
      sum += edge.orientation * x * l;
    }
    html.push('<tr><td colspan="4"><strong>Sum  &Sigma;<em>x</em>P</strong> ' +
        `<em>(should be zero)</em></td><td>${sum.toPrecision(2)}</td></tr>`);
    html.push('</table><br>');
    return html.join('\n');
  }

  inCycle(p) {
    // If process `p` is an edge in some cycle in the cycle basis, return the
    // sign of its orientation as '+' or '-'; otherwise return the empty string
    // (will evaluate as FALSE).
    for(const c of this.cycle_basis) {
      for(const e of c) if(e.process === p) return (e.orientation > 0 ? '+' : '-');
    }
    return '';
  }
  
  allCycleFlows(p) {
    // Return power flows for each cycle that `p` is part of as an HTML
    // table (so it can be displayed in the documentation dialog).
    if(!MODEL.solved) return '';
    const flows = [];
    for(let i = 0; i < this.cycle_basis.length; i++) {
      const c = this.cycle_basis[i];
      for(const e of c) if(e.process === p) {
        flows.push(`<h3>Flows through cycle (${i}):</h3>`,
            this.cycleFlowTable(c));
        break;
      }
    }
    return flows.join('\n');
  }
  
} // END of class PowerGridManager
