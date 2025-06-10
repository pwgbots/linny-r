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
    this.copy_btn = document.getElementById('finder-copy-btn');
    this.copy_btn.addEventListener(
        'click', (event) => FINDER.copyAttributesToClipboard(event.shiftKey));
    this.entity_table = document.getElementById('finder-table');
    this.item_table = document.getElementById('finder-item-table');
    this.expression_table = document.getElementById('finder-expression-table');
        
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
    // No list unless a pattern OR a specified SUB-set of entity types.
    if(fp || et && et !== VM.entity_letters) {
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
      if(et.indexOf('U') >= 0) {
        imgs += '<img src="images/scale.png">';
        for(let k in MODEL.products) if(MODEL.products.hasOwnProperty(k)) {
          if(fp && !k.startsWith(UI.BLACK_BOX) && patternMatch(
              MODEL.products[k].scale_unit, this.filter_pattern)) {
            enl.push(k);
            this.entities.push(MODEL.products[k]);
            addDistinct('Q', this.filtered_types);
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
      enl.sort((a, b) => UI.compareFullNames(a, b, true));
    }
    document.getElementById('finder-entity-imgs').innerHTML = imgs;
    let seid = 'etr';
    for(let i = 0; i < enl.length; i++) {
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
    // NOTE: Reset `selected_entity` if not in the new list.
    if(seid === 'etr') this.selected_entity = null;
    this.entity_table.innerHTML = el.join('');
    UI.scrollIntoView(document.getElementById(seid));
    document.getElementById('finder-count').innerHTML = pluralS(
        el.length, 'entity', 'entities');
    // Only show the edit button if all filtered entities are of the
    // same type.
    let n = el.length;
    this.edit_btn.style.display = 'none';
    this.copy_btn.style.display = 'none';
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
      n = this.entityGroup.length;
      if(n > 0) {
        this.edit_btn.title = 'Edit attributes of ' +
            pluralS(n, this.entities[0].type.toLowerCase());
        this.edit_btn.style.display = 'inline-block';
      }
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
    // while excluding (no actor), (top cluster), datasets and equations.
    const
        eg = [],
        ft = this.filtered_types[0];
    if(this.filtered_types.length === 1 && 'DE'.indexOf(ft) < 0) {
      for(const e of this.entities) {
        // Exclude "no actor" and top cluster.
        if(e.name && e.name !== '(no_actor)' && e.name !== '(top_cluster)' &&
            // Also exclude actor cash flow data products because
            // many of their properties should not be changed.
            !e.name.startsWith('$')) {
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
    md.element('attribute').innerHTML = html;
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
        s = UI.boxChecked('confirm-add-chart-variables-stacked'),
        enl = [];
    for(const e of this.entities) enl.push(e.name);
    enl.sort((a, b) => UI.compareFullNames(a, b, true));
    for(const en of enl) {
      const vi = c.addVariable(en, a);
      if(vi !== null) c.variables[vi].stacked = s;
    }
    CHART_MANAGER.updateDialog();
    md.hide();
  }
  
  updateRightPane() {
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
    if(/^(\*|U|M|[ABCDELPQ]+)\?/i.test(ft)) {
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
    }
  }
  
  copyAttributesToClipboard(shift) {
    // Copy relevant entity attributes as tab-separated text to clipboard.
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
