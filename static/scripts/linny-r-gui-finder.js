/*
Linny-R is an executable graphical specification language for (mixed integer)
linear programming (MILP) problems, especially unit commitment problems (UCP).
The Linny-R language and tool have been developed by Pieter Bots at Delft
University of Technology, starting in 2009. The project to develop a browser-
based version started in 2017. See https://linny-r.org for more information.

This JavaScript file (linny-r-gui-finder.js) provides the GUI functionality
for the Linny-R "finder": the draggable/resizable dialog for listing
model entities based on their name, and locating where they occur in the
model.

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

// CLASS Finder provides the finder dialog functionality
class Finder {
  constructor() {
    this.dialog = UI.draggableDialog('finder');
    UI.resizableDialog('finder', 'FINDER');
    this.close_btn = document.getElementById('finder-close-btn');
    // Make toolbar buttons responsive.
    this.close_btn.addEventListener('click', (e) => UI.toggleDialog(e));
    this.filter_input = document.getElementById('finder-filter-text');
    this.filter_input.addEventListener('input', () => FINDER.changeFilter());
    this.edit_btn = document.getElementById('finder-edit-btn');
    this.edit_btn.addEventListener(
        'click', () => FINDER.editAttributes());
    this.chart_btn = document.getElementById('finder-chart-btn');
    this.chart_btn.addEventListener(
        'click', () => FINDER.confirmAddChartVariables());
    this.table_btn = document.getElementById('finder-table-btn');
    this.table_btn.addEventListener(
        'click', () => FINDER.toggleViewAttributes());
    this.experiment_btn = document.getElementById('finder-experiment-btn');
    this.experiment_btn.addEventListener(
        'click', () => FINDER.toggleViewExperiment());
    this.copy_btn = document.getElementById('finder-copy-btn');
    this.copy_btn.addEventListener(
        'click', (event) => FINDER.copyAttributesToClipboard(event.shiftKey));
    this.entity_scroll_area = document.getElementById('finder-scroll-area');
    this.entity_scroll_area.addEventListener(
        'scroll', () => FINDER.scrollEntityArea());
    this.entity_table = document.getElementById('finder-table');
    this.item_table = document.getElementById('finder-item-table');
    this.expression_table = document.getElementById('finder-expression-table');
    this.data_pane = document.getElementById('finder-data-pane');
    this.data_header = document.getElementById('finder-data-header');
    this.data_scroll_area = document.getElementById('finder-data-scroll-area');
    this.data_scroll_area.addEventListener(
        'scroll', () => FINDER.scrollDataArea());
    this.data_table = document.getElementById('finder-data-table');
        
    // The Confirm add chart variables modal.
    this.add_chart_variables_modal = new ModalDialog('confirm-add-chart-variables');
    this.add_chart_variables_modal.ok.addEventListener(
        'click', () => FINDER.addVariablesToChart());
    this.add_chart_variables_modal.cancel.addEventListener(
        'click', () => FINDER.add_chart_variables_modal.hide());

    // Attribute headers are used by Finder to output entity attribute values.
    this.attribute_headers = {
        A: 'ACTORS:\tWeight\tCash IN\tCash OUT\tCash FLOW',
        B: 'CONSTRAINTS (no attributes)',
        C: 'CLUSTERS:\tCash IN\tCash OUT\tCash FLOW',
        D: 'DATASETS:\tModifier\tValue/expression',
        E: 'EQUATIONS:\tValue/expression',
        L: 'LINKS:\nFrom\tTo\tRate\tDelay\tShare of cost\tActual flow',
        P: 'PROCESSES:\tLower bound\tUpper bound\tInitial level\tLevel' +
              '\tCash IN\tCash OUT\tCash FLOW\tCost price',
        Q: 'PRODUCTS:\tLower bound\tUpper bound\tInitial level\tPrice' +
              '\tLevel\tCost price\tHighest cost price'
      };
    // Set own properties.
    this.entities = [];
    this.filtered_types = [];
    this.reset();
  }

  reset() {
    this.entities.length = 0;
    this.filtered_types.length = 0;
    this.selected_entity = null;
    this.filter_input.value = '';
    this.filter_string = '';
    this.filter_pattern = null;
    this.entity_types = VM.entity_letters;
    this.find_links = true;
    this.last_time_clicked = 0;
    this.clicked_object = null;
    // Product cluster index "remembers" for which cluster a product was
    // last revealed, so it can reveal the next cluster when clicked again.
    this.product_cluster_index = 0;
    this.tabular_view = false;
    this.experiment_view = false;
  }
  
  doubleClicked(obj) {
    const
        now = Date.now(),
        dt = now - this.last_time_clicked;
    this.last_time_clicked = now;
    if(obj === this.clicked_object) {
      // Consider click to be "double" if it occurred less than 300 ms ago.
      if(dt < 300) {
        this.last_time_clicked = 0;
        return true;
      }
    }
    this.clicked_object = obj;
    return false;
  }
  
  enterKey() {
    // Open "edit properties" dialog for the selected entity.
    const srl = this.entity_table.getElementsByClassName('sel-set');
    if(srl.length > 0) {
      const r = this.entity_table.rows[srl[0].rowIndex];
      if(r) {
        const e = new Event('click');
        e.altKey = true;
        r.dispatchEvent(e);
      }
    }
  }
  
  upDownKey(dir) {
    // Select row above or below the selected one (if possible).
    const srl = this.entity_table.getElementsByClassName('sel-set');
    if(srl.length > 0) {
      const r = this.entity_table.rows[srl[0].rowIndex + dir];
      if(r) {
        UI.scrollIntoView(r);
        r.dispatchEvent(new Event('click'));
      }
    }
  }
  
  updateDialog() {
    const
        el = [],
        enl = [],
        se = this.selected_entity,
        et = this.entity_types,
        fp = this.filter_pattern && this.filter_pattern.length > 0;
    let imgs = '';
    this.entities.length = 0;
    this.filtered_types.length = 0;
    if(this.experiment_view) {
      // List outcome variables of selected experiment.
      const x = EXPERIMENT_MANAGER.selected_experiment;
      if(x) {
        x.inferVariables();
        for(const v of x.variables) {
          const obj = v.object;
          if(et !== VM.entity_letters && et.indexOf(obj.typeLetter) >= 0) {
            if(!fp || patternMatch(obj.displayName, this.filter_pattern)) {
              this.entities.push(v);
              enl.push(v.displayName);
            }
          }
        }
      }
    } else if(fp || et && et !== VM.entity_letters) {
      // No list unless a pattern OR a specified SUB-set of entity types.
      if(et.indexOf('A') >= 0) {
        imgs += '<img src="images/actor.png">';
        for(let k in MODEL.actors) if(MODEL.actors.hasOwnProperty(k)) {
          if(!fp || patternMatch(MODEL.actors[k].name, this.filter_pattern)) {
            enl.push(k);
            this.entities.push(MODEL.actors[k]);
            addDistinct('A', this.filtered_types);
          }
        }
      }
      // NOTE: Do not list black-boxed entities.
      if(et.indexOf('P') >= 0) {
        imgs += '<img src="images/process.png">';
        for(let k in MODEL.processes) if(MODEL.processes.hasOwnProperty(k)) {
          if(!k.startsWith(UI.BLACK_BOX) && (!fp || patternMatch(
              MODEL.processes[k].displayName, this.filter_pattern))) {
            enl.push(k);
            this.entities.push(MODEL.processes[k]);
            addDistinct('P', this.filtered_types);
          }
        }
      }
      if(et.indexOf('Q') >= 0) {
        imgs += '<img src="images/product.png">';
        for(let k in MODEL.products) if(MODEL.products.hasOwnProperty(k)) {
          if(!k.startsWith(UI.BLACK_BOX) && (!fp || patternMatch(
              MODEL.products[k].displayName, this.filter_pattern))) {
            enl.push(k);
            this.entities.push(MODEL.products[k]);
            addDistinct('Q', this.filtered_types);
          }
        }
      }
      if(et.indexOf('C') >= 0) {
        imgs += '<img src="images/cluster.png">';
        for(let k in MODEL.clusters) if(MODEL.clusters.hasOwnProperty(k)) {
          if(!k.startsWith(UI.BLACK_BOX) && (!fp || patternMatch(
              MODEL.clusters[k].displayName, this.filter_pattern))) {
            enl.push(k);
            this.entities.push(MODEL.clusters[k]);
            addDistinct('C', this.filtered_types);
          }
        }
      }
      if(et.indexOf('D') >= 0) {
        imgs += '<img src="images/dataset.png">';
        for(let k in MODEL.datasets) if(MODEL.datasets.hasOwnProperty(k)) {
          const ds = MODEL.datasets[k];
          if(!k.startsWith(UI.BLACK_BOX) && (!fp || patternMatch(
              ds.displayName, this.filter_pattern))) {
            // NOTE: Do not list the equations dataset.
            if(ds !== MODEL.equations_dataset) {
              enl.push(k);
              this.entities.push(MODEL.datasets[k]);
              addDistinct('D', this.filtered_types);
            }
          }
        }
      }
      if(et.indexOf('E') >= 0) {
        imgs += '<img src="images/equation.png">';
        for(let k in MODEL.equations_dataset.modifiers) {
          if(MODEL.equations_dataset.modifiers.hasOwnProperty(k)) {
            if(!fp ||
                patternMatch(MODEL.equations_dataset.modifiers[k].displayName,
                    this.filter_pattern)) {
              enl.push(k);
              this.entities.push(MODEL.equations_dataset.modifiers[k]);
              addDistinct('E', this.filtered_types);
            }
          }
        }
      }
      if(et.indexOf('L') >= 0) {
        imgs += '<img src="images/link.png">';
        for(let k in MODEL.links) if(MODEL.links.hasOwnProperty(k)) {
          // NOTE: "black-boxed" link identifiers are not prefixed => other test.
          const
              l = MODEL.links[k],
              ldn = l.displayName,
              // A link is "black-boxed" when BOTH nodes are "black-boxed".
              bb = ldn.split(UI.BLACK_BOX).length > 2;
          if(!bb && (!fp || patternMatch(ldn, this.filter_pattern))) {
            enl.push(k);
            this.entities.push(l);
            addDistinct('L', this.filtered_types);
          }
        }
      }
      if(et.indexOf('B') >= 0) {
        imgs += '<img src="images/constraint.png">';
        for(let k in MODEL.constraints) {
          // NOTE: Likewise, constraint identifiers can be prefixed by %.
          if(MODEL.constraints.hasOwnProperty(k)) {
            if(!k.startsWith(UI.BLACK_BOX) && (!fp || patternMatch(
                MODEL.constraints[k].displayName, this.filter_pattern))) {
              enl.push(k);
              this.entities.push(MODEL.constraints[k]);
              addDistinct('B', this.filtered_types);
            }
          }
        }
      }
      // Also allow search for scale unit names.
      if(et === 'U') {
        imgs = '<img src="images/scale.png">';
        for(let k in MODEL.products) if(MODEL.products.hasOwnProperty(k)) {
          if(fp && !k.startsWith(UI.BLACK_BOX) && patternMatch(
              MODEL.products[k].scale_unit, this.filter_pattern)) {
            enl.push(k);
            this.entities.push(MODEL.products[k]);
            addDistinct('Q', this.filtered_types);
          }
        }
        for(let k in MODEL.datasets) if(MODEL.datasets.hasOwnProperty(k)) {
          if(fp && !k.startsWith(UI.BLACK_BOX)) {
            const ds = MODEL.datasets[k];
            if(ds !== MODEL.equations_dataset && patternMatch(
                ds.scale_unit, this.filter_pattern)) {
              enl.push(k);
              this.entities.push(MODEL.datasets[k]);
              addDistinct('D', this.filtered_types);
            }
          }
        }
      }
      // Also allow search for dataset modifier selectors.
      if(et.indexOf('S') >= 0) {
        imgs = '<img src="images/dataset.png">';
        for(let k in MODEL.datasets) if(MODEL.datasets.hasOwnProperty(k)) {
          if(fp && !k.startsWith(UI.BLACK_BOX)) {
            const ds = MODEL.datasets[k];
            if(ds !== MODEL.equations_dataset) {
              for(let mk in ds.modifiers) if(ds.modifiers.hasOwnProperty(mk)) {
                if(patternMatch(
                    ds.modifiers[mk].selector, this.filter_pattern)) {
                  enl.push(k);
                  this.entities.push(MODEL.datasets[k]);
                  addDistinct('D', this.filtered_types);
                  break;
                }
              }
            }
          }
        }
      }
      // Also allow search for link multiplier symbols.
      if(et.indexOf('M') >= 0) {
        if(imgs.indexOf('/link.') < 0) imgs += '<img src="images/link.png">';
        for(let k in MODEL.links) if(MODEL.links.hasOwnProperty(k)) {
          // NOTE: "black-boxed" link identifiers are not prefixed => other test.
          const
              l = MODEL.links[k],
              m = VM.LM_LETTERS.charAt(l.multiplier),
              // A link is "black-boxed" when BOTH nodes are "black-boxed".
              bb = l.displayName.split(UI.BLACK_BOX).length > 2;
          if(fp && !bb && this.filter_string.indexOf(m) >= 0) {
            enl.push(k);
            this.entities.push(l);
            addDistinct('L', this.filtered_types);
          }
        }
      }
      // NOTE: Pass TRUE to indicate "comparison of identifiers".
      enl.sort((a, b) => UI.compareFullNames(a, b, true));
    }
    document.getElementById('finder-entity-imgs').innerHTML = imgs;
    let n = enl.length,
        seid = 'etr';
    for(let i = 0; i < n; i++) {
      if(this.experiment_view) {
        el.push(['<tr id="etr', i, '" class="dataset"><td>',
            '<div class="series">', enl[i], '</div></td></tr>'].join(''));
      } else {
        const e = MODEL.objectByID(enl[i]);
        if(e === se) seid += i;
        el.push(['<tr id="etr', i, '" class="dataset',
            (e === se ? ' sel-set' : ''), '" onclick="FINDER.selectEntity(\'',
            enl[i], '\', event.altKey);" onmouseover="FINDER.showInfo(\'', enl[i],
            '\', event.shiftKey);"><td draggable="true" ',
            'ondragstart="FINDER.drag(event);"><img class="finder" src="images/',
            e.type.toLowerCase(), '.png">', e.displayName,
            '</td></tr>'].join(''));
      }
    }
    // NOTE: Reset `selected_entity` if not in the new list.
    if(seid === 'etr') this.selected_entity = null;
    this.entity_table.innerHTML = el.join('');
    UI.scrollIntoView(document.getElementById(seid));
    document.getElementById('finder-count').innerHTML = pluralS(n,
        'entity', 'entities');
    this.edit_btn.style.display = 'none';
    this.chart_btn.style.display = 'none';
    this.table_btn.style.display = 'none';
    this.copy_btn.style.display = 'none';
/*
    // Show the experiment button only when at least 1 experiment exists.
    this.experiment_btn.style.display = (MODEL.experiments.length ?
        'inline-block' : 'none');
*/
    // Only show other buttons if the set of filtered entities is not empty.
    if(n > 0) {
      this.copy_btn.style.display = 'inline-block';
      if(CHART_MANAGER.visible && CHART_MANAGER.chart_index >= 0) {
        const ca = this.commonAttributes;
        if(ca.length) {
          this.chart_btn.title = 'Add ' + pluralS(n, 'variable') +
              ' to selected chart';
          this.chart_btn.style.display = 'inline-block';
        }
      }
      // NOTE: Enable editing and tabular view only when filter results
      // in a single entity type.
      n = this.entityGroup.length;
      if(n > 0) {
        this.edit_btn.title = 'Edit attributes of ' +
            pluralS(n, this.entities[0].type.toLowerCase());
        this.edit_btn.style.display = 'inline-block';
        this.table_btn.style.display = 'inline-block';
      }
    }
    // Show toggle button status.
    if(this.tabular_view) {
      this.table_btn.classList.add('stay-activ');
    } else {
      this.table_btn.classList.remove('stay-activ');
    }
    if(this.experiment_view) {
      this.experiment_btn.classList.add('stay-activ');
    } else {
      this.experiment_btn.classList.remove('stay-activ');
    }
    this.updateRightPane();
  }
  
  get commonAttributes() {
    // Returns list of attributes that all filtered entities have in common.
    let ca = Object.keys(VM.attribute_names);
    for(const et of this.filtered_types) {
      ca = intersection(ca, VM.attribute_codes[et]);
    }
    return ca;
  }
  
  get entityGroup() {
    // Returns the list of filtered entities if all are of the same type,
    // while excluding (no actor), (top cluster), and equations.
    const
        eg = [],
        ft = this.filtered_types[0];
    if(this.filtered_types.length === 1 && ft !== 'E') {
      for(const e of this.entities) {
        // Exclude "no actor" and top cluster.
        if(!e.name || (e.name !== '(no_actor)' && e.name !== '(top_cluster)' &&
            // Also exclude actor cash flow data products because
            // many of their properties should not be changed.
            !e.name.startsWith('$'))) {
          eg.push(e);
        }
      }
    }
    return eg;
  }
  
  confirmAddChartVariables() {
    // Show confirmation dialog to add variables to chart.
    const
        md = this.add_chart_variables_modal,
        n = this.entities.length,
        ca = this.commonAttributes;
    let html,
        et = '1 entity';
    if(this.filtered_types.length === 1) {
      et = pluralS(n, this.entities[0].type.toLowerCase());
    } else if(n !== 1) {
      et = `${n} entities`;
    }
    for(const a of ca) {
      html += `<option value="${a}">${VM.attribute_names[a]}</option>`;
    }
    if(html) {
      md.element('attr-of').style.display = 'inline-block';
      md.element('attribute').innerHTML = html;
    } else {
      md.element('attr-of').style.display = 'none';
      md.element('attribute').innerHTML = '';
    }
    md.element('count').innerText = et;
    md.show();
  }
  
  addVariablesToChart() {
    // Add selected attribute for each filtered entity as chart variable
    // to the selected chart.
    const
        md = this.add_chart_variables_modal,
        ci = CHART_MANAGER.chart_index;
    // Double-check whether chart exists.
    if(ci < 0 || ci >= MODEL.charts.length) {
      console.log('ANOMALY: No chart for index', ci);
    }
    const
        c = MODEL.charts[ci],
        a = md.element('attribute').value,
        abs = UI.boxChecked('confirm-add-chart-variables-absolute'),
        stack = UI.boxChecked('confirm-add-chart-variables-stacked'),
        enl = [];
    for(const e of this.entities) enl.push(e.name);
    enl.sort((a, b) => UI.compareFullNames(a, b, true));
    for(const en of enl) {
      const vi = c.addVariable(en, a);
      if(vi !== null) {
        c.variables[vi].absolute = abs;
        c.variables[vi].stacked = stack;
      }
    }
    CHART_MANAGER.updateDialog();
    md.hide();
  }
  
  scrollEntityArea() {
    // When in tabular view, the data table must scroll along with the
    // entity table.
    if(this.tabular_view) {
      this.data_scroll_area.scrollTop = this.entity_scroll_area.scrollTop;
    }
  }
  
  scrollDataArea() {
    // When in tabular view, the entity table must scroll along with the
    // data table.
    if(this.tabular_view) {
      this.entity_scroll_area.scrollTop = this.data_scroll_area.scrollTop;
    }
  }
  
  updateRightPane() {
    // Right pane can display attribute data...
    if(this.tabular_view) {
      this.data_pane.style.display = 'block';
      this.updateTabularView();
      return;
    }
    // ... or no data...
    this.data_pane.style.display = 'none';
    this.data_table.innerHTML = '';
    // ... but information on the occurence of the selected entity.
    const
        se = this.selected_entity,
        occ = [], // list with occurrences (clusters, processes or charts)
        xol = [], // list with identifier of "expression owning" entities
        xal = [], // list with attributes having matching expressions
        el = []; // list of HTML elements (table rows) to be added
    let hdr = '(no entity selected)';
    if(se) {
      hdr = `<em>${se.type}:</em> <strong>${se.displayName}</strong>`;
      // Make occurrence list.
      if(se instanceof Process || se instanceof Cluster) {
        // Processes and clusters "occur" in their parent cluster.
        if(se.cluster) occ.push(se.cluster.identifier);
      } else if(se instanceof Product) {
        // Products "occur" in clusters where they have a position.
        for(const c of se.productPositionClusters) occ.push(c.identifier);
      } else if(se instanceof Actor) {
        // Actors "occur" in clusters where they "own" processes or clusters.
        for(let k in MODEL.processes) if(MODEL.processes.hasOwnProperty(k)) {
          const p = MODEL.processes[k];
          if(p.actor === se) occ.push(p.identifier);
        }
        for(let k in MODEL.clusters) if(MODEL.clusters.hasOwnProperty(k)) {
          const c = MODEL.clusters[k];
          if(c.actor === se) occ.push(c.identifier);
        }
      } else if(se instanceof Link || se instanceof Constraint) {
        // Links and constraints "occur" in their "best" parent cluster.
        const c = MODEL.inferParentCluster(se);
        if(c) occ.push(c.identifier);
      }
      // NOTE: No "occurrence" of datasets or equations.
      // @@TO DO: identify MODULES (?)
      // All entities can also occur as chart variables.
      for(let ci = 0; ci < MODEL.charts.length; ci++) {
        const c = MODEL.charts[ci];
        for(const v of c.variables) {
          if(v.object === se || (se instanceof DatasetModifier &&
              se.identifier === UI.nameToID(v.attribute))) {
            occ.push(MODEL.chart_id_prefix + ci);
            break;
          }
        }
      }
      // Now also look for occurrences of entity references in expressions.
      const
          raw = escapeRegex(se.displayName),
          re = new RegExp(
              '\\[\\s*!?' + raw.replace(/\s+/g, '\\s+') + '\\s*[\\|\\@\\]]');
      // Check actor weight expressions.
      for(let k in MODEL.actors) if(MODEL.actors.hasOwnProperty(k)) {
        const a = MODEL.actors[k];
        if(re.test(a.weight.text)) {
          xal.push('W');
          xol.push(a.identifier);
        }
      }
      // Check all process attribute expressions.
      for(let k in MODEL.processes) if(MODEL.processes.hasOwnProperty(k)) {
        const p = MODEL.processes[k];
        if(re.test(p.lower_bound.text)) {
          xal.push('LB');
          xol.push(p.identifier);
        }
        if(re.test(p.upper_bound.text)) {
          xal.push('UB');
          xol.push(p.identifier);
        }
        if(re.test(p.initial_level.text)) {
          xal.push('IL');
          xol.push(p.identifier);
        }
      }
      // Check all product attribute expressions.
      for(let k in MODEL.products) if(MODEL.products.hasOwnProperty(k)) {
        const p = MODEL.products[k];
        if(re.test(p.lower_bound.text)) {
          xal.push('LB');
          xol.push(p.identifier);
        }
        if(re.test(p.upper_bound.text)) {
          xal.push('UB');
          xol.push(p.identifier);
        }
        if(re.test(p.initial_level.text)) {
          xal.push('IL');
          xol.push(p.identifier);
        }
        if(re.test(p.price.text)) {
          xal.push('P');
          xol.push(p.identifier);
        }
      }
      // Check all notes in clusters for their color expressions and field.
      for(let k in MODEL.clusters) if(MODEL.clusters.hasOwnProperty(k)) {
        const c = MODEL.clusters[k];
        for(const n of c.notes) {
          // Look for entity in both note contents and note color expression.
          if(re.test(n.color.text) || re.test(n.contents)) {
            xal.push('NOTE');
            xol.push(n.identifier);
          }
        }
      }
      // Check all link rate expressions.
      for(let k in MODEL.links) if(MODEL.links.hasOwnProperty(k)) {
        const l = MODEL.links[k];
        if(re.test(l.relative_rate.text)) {
          xal.push('R');
          xol.push(l.identifier);
        }
        if(re.test(l.flow_delay.text)) {
          xal.push('D');
          xol.push(l.identifier);
        }
      }
      // Check all constraint boundline index expressions.
      for(let k in MODEL.constraints) if(MODEL.constraints.hasOwnProperty(k)) {
        const c = MODEL.constraints[k];
        for(let i = 0; i < c.bound_lines.length; i++) {
          const bl = c.bound_lines[i];
          for(const sel of bl.selectors) if(re.test(sel.expression.text)) {
            xal.push('I' + (i + 1));
            xol.push(c.identifier);
          }
        }
      }
      // Check all dataset modifier expressions.
      for(let k in MODEL.datasets) if(MODEL.datasets.hasOwnProperty(k)) {
        const ds = MODEL.datasets[k];
        for(let m in ds.modifiers) if(ds.modifiers.hasOwnProperty(m)) {
          const dsm = ds.modifiers[m];
          if(re.test(dsm.expression.text)) {
            xal.push(dsm.selector);
            xol.push(ds.identifier);
          }
        }
      }
    }
    document.getElementById('finder-item-header').innerHTML = hdr;
    occ.sort(compareSelectors);
    for(let i = 0; i < occ.length; i++) {
      const e = MODEL.objectByID(occ[i]);
      el.push(['<tr id="eotr', i, '" class="dataset" onclick="FINDER.reveal(\'',
          occ[i], '\');" onmouseover="FINDER.showInfo(\'',
          occ[i], '\', event.shiftKey);"><td><img class="finder" src="images/',
          e.type.toLowerCase(), '.png">', e.displayName,
          '</td></tr>'].join(''));
    }
    this.item_table.innerHTML = el.join('');
    // Clear the table row list.
    el.length = 0;
    // Now fill it with entity+attribute having a matching expression.
    for(let i = 0; i < xal.length; i++) {
      const
          id = xol[i],
          e = MODEL.objectByID(id),
          attr = (e instanceof Note ? '' : xal[i]);
      let img = e.type.toLowerCase(),
          // NOTE: A small left-pointing triangle denotes that the right-hand
          // part has the left hand part as its attribute.
          cs = '',
          td = attr + '</td><td>&#x25C2;</td><td style="width:95%">' +
              e.displayName;
      // NOTE: Equations may have LONG names while the equations dataset
      // name is irrelevant, hence use 3 columns (no triangle).
      if(e === MODEL.equations_dataset) {
        img = 'equation';
        cs = ' colspan="3"';
        td = attr;
      }
      el.push(['<tr id="eoxtr', i,
          '" class="dataset" onclick="FINDER.revealExpression(\'', id,
          '\', \'', attr, '\', event.shiftKey, event.altKey);"><td', cs, '>',
          '<img class="finder" src="images/', img, '.png">', td, '</td></tr>'
          ].join(''));
    }
    this.expression_table.innerHTML = el.join('');
    document.getElementById('finder-expression-hdr').innerHTML =
        pluralS(el.length, 'expression');
  }

  toggleViewAttributes() {
    // Show/hide tabular display of entity attributes.
    this.tabular_view = !this.tabular_view;
    this.updateRightPane();
    if(this.tabular_view) {
      this.table_btn.classList.add('stay-activ');
    } else {
      this.table_btn.classList.remove('stay-activ');
    }
  }
  
  toggleViewExperiment() {
    // Switch between model entities and experiment outcomes.
    this.experiment_view = !this.experiment_view;
    if(this.experiment_view) this.tabular_view = true;
    this.updateDialog();
  }
  
  updateTabularView() {
    // Display data values when tabular view is active.
    if(!this.entities.length ||
        (this.filtered_types.length !== 1 && !this.experiment_view)) {
      this.data_table.innerHTML = '';
      return;
    }
    const
        special = ['\u221E', '-\u221E', '\u2047', '\u00A2'],
        rows = [],
        etl = this.entities[0].typeLetter,
        data_list = [],
        data = {};
    // Collect data and sort list by name, so it coresponds with the
    // entities listed in the left pane.
    if(this.experiment_view) {
      // Get selected runs.
      const
          x = EXPERIMENT_MANAGER.selected_experiment,
          runs = (x ? x.chart_combinations : []);
      if(!runs.length) {
        UI.notify('');
        this.data_table.innerHTML = '';
        return;
      }
      // Add aray for each run.
      data[0] = [];
      for(const e of this.entities) {
        const run_data = {name: e.object.displayName};
        // Add value for each run.
        data_list.push(run_data);
      }
      data_list.sort((a, b) => UI.compareFullNames(a.name, b.name));
    } else {
      for(const e of this.entities) data_list.push(e.attributes);
      data_list.sort((a, b) => UI.compareFullNames(a.name, b.name));
      // The data "matrix" then holds values as an array per attribute code.
      // NOTE: Datasets are special in that their data is a multi-line
      // string of tab-separated key-value pairs where the first pair has no
      // key (dataset default value) and the other pairs have a dataset
      // modifier selector as key.
      if(etl === 'D') {
        // First compile the list of unique selectors.
        const sel = [];
        for(const ed of data_list) {
          // NOTE: Dataset modifier lines start with a tab.
          const lines = ed.D.split('\n\t');
          // Store default value in entity data object for second iteration.
          ed.dv = VM.sig4Dig(safeStrToFloat(lines[0].trim(), 0));
          for(let i = 1; i < lines.length; i++) {
            const pair = lines[i].split('\t');
            if(pair[0]) {
              addDistinct(pair[0], sel);
              // Store pair value in entity data object for second iteration.
              ed[pair[0]] = (pair.length > 1 ? pair[1] : '');
            }
          }
        }
        sel.sort(compareSelectors);
        // Initialize arrays for default values and for selectors.
        // NOTE: The parentheses of '(default)'ensure that there is no doubling
        // with a selector defined by the modeler.
        data['(default)'] = [];
        for(const s of sel) data[s] = [];
        // Perform second iteration.
        for(const ed of data_list) {
          data['(default)'].push(ed.dv);
          for(const s of sel) {
            if(ed[s]) {
              const f = parseFloat(ed[s]);
              data[s].push(isNaN(f) ? ed[s] : VM.sig4Dig(f));
            } else {
              // Empty string to denote "no modifier => not calculated". 
              data[s].push('\u2047');
            }
          }
        }
      } else {
        // Initialize array per selector.
        let atcodes = VM.attribute_codes[etl];
        if(!MODEL.solved) atcodes = complement(atcodes, VM.level_based_attr);
        if(!MODEL.infer_cost_prices) atcodes = complement(atcodes, ['CP', 'HCP', 'SOC']);
        for(const ac of atcodes) data[ac] = [];
        for(const ed of data_list) {
          for(const ac of atcodes) {
            let v = ed[ac];
            if(v === '') {
              // Empty strings denote "undefined". 
              v = '\u2047';
            // Keep special values such as infinity and exception codes.
            } else if(special.indexOf(v) < 0) {
              // When model is not solved, expression values will be the
              // expression string, and this is likely to be not parsable. 
              const f = parseFloat(v);
              if(isNaN(f)) {
                v = '\u2297'; // Circled X to denote "not computed".
              } else {
                v = VM.sig4Dig(parseFloat(f.toPrecision(4)));
              }
            }
            data[ac].push(v);
          }
        }
      }
    }
    // Create header.
    const
        keys = Object.keys(data),
        row = [],
        perc = (97 / keys.length).toPrecision(3),
        style = `min-width: ${perc}%; max-width: ${perc}%`;
    for(const k of keys) {
      row.push(`<td style="${style}">${k}</td>`);
    }
    this.data_header.innerHTML = '<tr>' + row.join('') + '</tr>';
    // Format each array with uniform decimals.
    for(const k of keys) uniformDecimals(data[k]);
    const n = data_list.length;
    for(let index = 0; index < n; index++) {
      const row = [];
      for(const k of keys) {
        row.push(`<td style="${style}">${data[k][index]}</td>`);
      }
      rows.push('<tr>' + row.join('') + '</tr>');
    }
    this.data_table.innerHTML = rows.join('');
  }
  
  drag(ev) {
    // Start dragging the selected entity.
    let t = ev.target;
    while(t && t.nodeName !== 'TD') t = t.parentNode;
    ev.dataTransfer.setData('text', MODEL.objectByName(t.innerText).identifier);
    ev.dataTransfer.setDragImage(t, 25, 20);
  }
  
  changeFilter() {
    // Filter expression can start with 1+ entity letters plus `?` to
    // look only for the entity types denoted by these letters.
    let ft = this.filter_input.value,
        et = VM.entity_letters;
    if(/^(\*|U|M|S|[ABCDELPQ]+)\?/i.test(ft)) {
      ft = ft.split('?');
      // NOTE: *? denotes "all entity types except constraints".
      et = (ft[0] === '*' ? 'ACDELPQ' : ft[0].toUpperCase());
      ft = ft.slice(1).join('=');
    }
    this.filter_string = ft;
    this.filter_pattern = patternList(ft);
    this.entity_types = et;
    this.updateDialog();
  }
  
  showInfo(id, shift) {
    // Display documentation for the entity identified by `id`.
    const e = MODEL.objectByID(id);
    if(e) DOCUMENTATION_MANAGER.update(e, shift);
  }
  
  selectEntity(id, alt=false) {
    // Look up entity, select it in the left pane, and update the right
    // pane. Open the "edit properties" modal dialog on double-click
    // and Alt-click if the entity is editable.
    const obj = MODEL.objectByID(id);
    this.selected_entity = obj;
    this.updateDialog();
    if(!obj) return;
    if(alt || this.doubleClicked(obj)) {
      if(obj instanceof Process) {
        UI.showProcessPropertiesDialog(obj);
      } else if(obj instanceof Product) {
        UI.showProductPropertiesDialog(obj);
      } else if(obj instanceof Link) {
        UI.showLinkPropertiesDialog(obj);
      } else if(obj instanceof Cluster && obj !== MODEL.top_cluster) {
        UI.showClusterPropertiesDialog(obj);
      } else if(obj instanceof Actor) {
        ACTOR_MANAGER.showEditActorDialog(obj.name, obj.weight.text);
      } else if(obj instanceof Note) {
        obj.showNotePropertiesDialog();
      } else if(obj instanceof Dataset) {
        if(UI.hidden('dataset-dlg')) {
          UI.buttons.dataset.dispatchEvent(new Event('click'));
        }
        DATASET_MANAGER.expandToShow(obj.name);
        DATASET_MANAGER.selected_dataset = obj;
        DATASET_MANAGER.updateDialog();
      } else if(obj instanceof DatasetModifier) {
        if(UI.hidden('equation-dlg')) {
          UI.buttons.equation.dispatchEvent(new Event('click'));
        }
        EQUATION_MANAGER.selected_modifier = obj;
        EQUATION_MANAGER.updateDialog();
      }
    }
  }
  
  reveal(id) {
    // Show selected occurrence.
    const
        se = this.selected_entity,
        obj = (se ? MODEL.objectByID(id) : null);
    if(!obj) console.log('Cannot reveal ID', id);
    // If cluster, make it focal...
    if(obj instanceof Cluster) {
      UI.makeFocalCluster(obj);
      // ... and select the entity unless it is an actor or dataset.
      if(!(se instanceof Actor || se instanceof Dataset)) {
        MODEL.select(se);
        if(se instanceof Link || se instanceof Constraint) {
          const a = obj.arrows[obj.indexOfArrow(se.from_node, se.to_node)];
          if(a) UI.scrollIntoView(a.shape.element.childNodes[0]);
        } else {
          UI.scrollIntoView(se.shape.element.childNodes[0]);
        }
      }
    } else if(obj instanceof Process || obj instanceof Note) {
      // If occurrence is a process or a note, then make its cluster focal...
      UI.makeFocalCluster(obj.cluster);
      // ... and select it.
      MODEL.select(obj);
      UI.scrollIntoView(obj.shape.element.childNodes[0]);
    } else if(obj instanceof Product) {
      // @@TO DO: iterate through list of clusters containing this product
    } else if(obj instanceof Link || obj instanceof Constraint) {
      const c = MODEL.inferParentCluster(obj);
      if(c) {
        UI.makeFocalCluster(c);
        MODEL.select(obj);
        const a = c.arrows[c.indexOfArrow(obj.from_node, obj.to_node)];
        if(a) UI.scrollIntoView(a.shape.element.childNodes[0]);
      }
    } else if(obj instanceof Chart) {
      // If occurrence is a chart, select and show it in the chart manager.
      CHART_MANAGER.chart_index = MODEL.charts.indexOf(obj);
      if(CHART_MANAGER.chart_index >= 0) {
        if(UI.hidden('chart-dlg')) {
          UI.buttons.chart.dispatchEvent(new Event('click'));
        }
      }
      CHART_MANAGER.updateDialog();
    }
    // NOTE: Return the object to save a second lookup by revealExpression.
    return obj;
  }
  
  revealExpression(id, attr, shift=false, alt=false) {
    const obj = this.reveal(id);
    if(!obj) return;
    shift = shift || this.doubleClicked(obj);
    if(attr && (shift || alt)) {
      if(obj instanceof Process) {
        // NOTE: the second argument makes the dialog focus on the specified
        // attribute input field; the third makes it open the expression editor
        // as if modeler clicked on edit expression button
        UI.showProcessPropertiesDialog(obj, attr, alt);
      } else if(obj instanceof Product) {
        UI.showProductPropertiesDialog(obj, attr, alt);
      } else if(obj instanceof Link) {
        UI.showLinkPropertiesDialog(obj, attr, alt);
      } else if(obj instanceof Note) {
        // NOTE: for notes, do not open expression editor, as entity may be
        // referenced not only in the color expression, but also in the text
        obj.showNotePropertiesDialog();
      } else if(obj === MODEL.equations_dataset) {
        // NOTE: equations are special type of dataset, hence this order
        if(UI.hidden('equation-dlg')) {
          UI.buttons.equation.dispatchEvent(new Event('click'));
        }
        // Double-check whether equation `attr` exists
        if(obj.modifiers.hasOwnProperty(attr)) {
          EQUATION_MANAGER.selected_modifier = obj.modifiers[attr];
        } else {
          EQUATION_MANAGER.selected_modifier = null;
        }
        EQUATION_MANAGER.updateDialog();
        if(alt) EQUATION_MANAGER.editEquation();
      } else if(obj instanceof Dataset) {
        if(UI.hidden('dataset-dlg')) {
          UI.buttons.dataset.dispatchEvent(new Event('click'));
        }
        DATASET_MANAGER.selected_dataset = obj;
        // Double-check whether dataset has `attr` as selector
        if(obj.modifiers.hasOwnProperty(attr)) {
          DATASET_MANAGER.selected_modifier = obj.modifiers[attr];
          if(alt) DATASET_MANAGER.editExpression();
        } else {
          DATASET_MANAGER.selected_modifier = null;
        }
        DATASET_MANAGER.updateDialog();
      }
    }
  }
  
  editAttributes() {
    // Show the Edit properties dialog for the filtered-out entities.
    // These must all be of the same type, or the edit button will not
    // show. Just in case, check anyway.
    const
        group = this.entityGroup,
        n = group.length;
    if(n === 0) return;
    let e = group[0];
    if(n === 1) {
      // Single entity, then edit its properties as usual.
      this.selectEntity(e.identifier, true);
      return;
    }
    // If an entity is selected in the list, use it as base.
    if(this.selected_entity) e = this.selected_entity;
    if(e instanceof Process) {
      UI.showProcessPropertiesDialog(e, 'LB', false, group);
    } else if(e instanceof Product) {
      UI.showProductPropertiesDialog(e, 'LB', false, group);
    } else if(e instanceof Link) {
      UI.showLinkPropertiesDialog(e, 'R', false, group);
    } else if(e instanceof Cluster) {
      UI.showClusterPropertiesDialog(e, group);
    } else if(e instanceof Dataset) {
      this.showDatasetGroupDialog(e, group);
    }
  }
  
  showDatasetGroupDialog(ds, dsl) {
    // Initialize fields with properties of first element of `dsl`.
    if(!dsl.length) return;
    const md = UI.modals.datasetgroup;
    md.group = dsl;
    md.selected_ds = ds;
    md.element('no-time-msg').style.display = (ds.array ? 'block' : 'none');
    md.show('prefix', ds);
  }
  
  updateDatasetGroupProperties() {
    // Update properties of selected group of datasets.
    const md = UI.modals.datasetgroup;
    if(!md.group.length) return;
    // Reduce multiple spaces to a single space.
    let prefix = md.element('prefix').value.replaceAll(/\s+/gi, ' ').trim();
    // Trim trailing colons (also when they have spaces between them).
    while(prefix.endsWith(':')) prefix = prefix.slice(0, -1).trim();
    // Count the updated chart variables and expressions.
    let cv_cnt = 0,
        xr_cnt = 0;
    // Only rename datasets if prefix has been changed.
    if(prefix !== md.shared_prefix) {
      // Check whether prefix is valid.
      if(prefix && !UI.validName(prefix)) {
        UI.warn(`Invalid prefix "${prefix}"`);
        return;
      }
      // Add the prefixer ": " to make it a true prefix.
      if(prefix) prefix += UI.PREFIXER;
      let old_prefix = md.shared_prefix;
      if(old_prefix) old_prefix += UI.PREFIXER;
      // Check whether prefix will create name conflicts.
      let nc = 0;
      for(const ds of md.group) {
        let nn = ds.name;
        if(nn.startsWith(old_prefix)) {
          nn = nn.replace(old_prefix, prefix);
          const obj = MODEL.objectByName(nn);
          if(obj && obj !== ds) {
            console.log('Anticipated name conflict with', obj.type,
                obj.displayName);
            nc++;
          }
        }
      }
      if(nc > 0) {
        UI.warn(`Prefix "${prefix}" will result in` +
            pluralS(nc, 'name conflict'));
        return;
      }
      // Rename the datasets -- this may affect the group.
      MODEL.renamePrefixedDatasets(old_prefix, prefix, md.group);
      cv_cnt += MODEL.variable_count;
      xr_cnt += MODEL.expression_count;
    }
    // Validate input field values.
    const dv = UI.validNumericInput('datasetgroup-default', 'default value');
    if(dv === false) return;
    const ts = UI.validNumericInput('datasetgroup-time-scale', 'time step');
    if(ts === false) return;
    // No issues => update *only the modified* properties of all datasets in
    // the group.
    const data = {
        'default': dv,
        'unit': md.element('unit').value.trim(),
        'periodic': UI.boxChecked('datasetgroup-periodic'),
        'array': UI.boxChecked('datasetgroup-array'),
        'time-scale': ts,
        'time-unit': md.element('time-unit').value,
        'method': md.element('method').value
      };
    for(let name in md.fields) if(md.changed[name]) {
      const
          prop = md.fields[name],
          value = data[name];
      for(const ds of md.group) ds[prop] = value;
    }
    // Also update the dataset modifiers.
    const dsv_list = MODEL.datasetVariables;
    for(const ds of md.group) {
      for(const k of Object.keys(md.selectors)) {
        const sel = md.selectors[k];
        if(ds.modifiers.hasOwnProperty(k)) {
           // If dataset `ds` has selector with key `k`,
           // first check if it has been deleted.
          if(sel.deleted) {
            // If so, delete this modifier it from `ds`.
            if(k === ds.default_selector) ds.default_selector = '';
            delete ds.modifiers[k];
          } else {
            // If not deleted, check whether the selector was renamed.
            const dsm = ds.modifiers[k];
            let s = k;
            if(sel.new_s) {
              // If so, let `s` be the key for new selector.
              s = UI.nameToID(sel.new_s);
              dsm.selector = sel.new_s;
              if(s !== k) {
                // Add modifier with its own selector key.
                ds.modifiers[s] = ds.modifiers[k];
                delete ds.modifiers[k];
              }
              // Always update all chart variables referencing dataset + old selector.
              for(const v of dsv_list) {
                if(v.object === ds && v.attribute === sel.sel) {
                  v.attribute = sel.new_s;
                  cv_cnt++;
                }
              }
              // Also replace old selector in all expressions (count these as well).
              xr_cnt += MODEL.replaceAttributeInExpressions(
                  ds.name + '|' + sel.sel, sel.new_s);
            }
            // NOTE: Keep original expression unless a new expression is specified.
            if(sel.new_x) {
              dsm.expression.text = sel.new_x;
              // Clear code so the expresion will be recompiled.
              dsm.expression.code = null;
            }
          }
        } else {
          // If dataset `ds` has NO selector with key `k`, add the (new) selector.
          let s = sel.sel,
              id = k;
          if(sel.new_s) {
            s = sel.new_s;
            id = UI.nameToID(sel.new_s);
          }
          const dsm = new DatasetModifier(ds, s);
          dsm.expression.text = (sel.new_x === false ? sel.expr : sel.new_x);
          ds.modifiers[id] = dsm;
        }
      }
      // Set the new default selector (if changed).
      if(md.new_defsel !== false) {
        // NOTE: `new_defsel` is a key; the actual selector name may have upper case
        // letters, so get the selector name.
        const dsm = ds.modifiers[md.new_defsel];
        if(dsm) {
          ds.default_selector = dsm.selector;
        } else {
          throw(`Unknown selector: ${md.new_defsel}`);
        }
      }
    }
    // Notify modeler of changes (if any).
    const msg = [];
    if(cv_cnt) msg.push(pluralS(cv_cnt, ' chart variable'));
    if(xr_cnt) msg.push(pluralS(xr_cnt, ' expression variable'));
    if(msg.length) {
      UI.notify('Updated ' +  msg.join(' and '));
    }
    MODEL.cleanUpScaleUnits();
    MODEL.updateDimensions();
    md.hide();
    // Also update the draggable dialogs that may be affected.
    UI.updateControllerDialogs('CDEFIJX');
  }
  
  copyAttributesToClipboard(shift) {
    // Copy relevant entity attributes as tab-separated text to clipboard.
    // When copy button is Shift-clicked, only data for the selected entity
    // is copied.
    // NOTE: All entity types have "get" method `attributes` that returns an
    // object that for each defined attribute (and if model has been
    // solved also each inferred attribute) has a property with its value.
    // For dynamic expressions, the expression text is used.
    const ea_dict = {A: [], B: [], C: [], D: [], E: [], L: [], P: [], Q: []};
    const e = this.selected_entity;
    if(shift && e) {
      ea_dict[e.typeLetter].push(e.attributes);
    } else {
      for(const e of this.entities) ea_dict[e.typeLetter].push(e.attributes);
    }
    const
      seq = ['A', 'B', 'C', 'D', 'E', 'P', 'Q', 'L'],
      text = [],
      attr = [];
    for(const etl of seq) {
      const
          ead = ea_dict[etl],
          atcodes = VM.attribute_codes[etl];
      if(ead && ead.length > 0) {
        // No blank line before first entity type.
        if(text.length > 0) text.push('');
        const en = capitalized(VM.entity_names[etl]);
        let ah = en + '\t' + VM.entity_attribute_names[etl].join('\t');
        if(etl === 'L' || etl === 'B') ah = ah.replace(en, `${en} FROM\tTO`);
        if(!MODEL.infer_cost_prices) {
          // If no cost price calculation, trim associated attributes
          // from the header.
          ah = ah.replace('\tCost price', '').replace('\tShare of cost', '');
        }
        text.push(ah);
        attr.length = 0;
        for(const ea of ead) {
          const al = [ea.name];
          for(const ac of atcodes) if(ea.hasOwnProperty(ac)) al.push(ea[ac]);
          attr.push(al.join('\t'));
        }
        attr.sort();
        text.push(attr.join('\n'));
      }
    }
    UI.copyStringToClipboard(text.join('\n'));
  }
  
} // END of class Finder
