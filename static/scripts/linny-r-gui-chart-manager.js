/*
Linny-R is an executable graphical specification language for (mixed integer)
linear programming (MILP) problems, especially unit commitment problems (UCP).
The Linny-R language and tool have been developed by Pieter Bots at Delft
University of Technology, starting in 2009. The project to develop a browser-
based version started in 2017. See https://linny-r.org for more information.

This JavaScript file (linny-r-gui-chartmgr.js) provides the GUI functionality
for the Linny-R Chart Manager dialog.

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

// CLASS GUIChartManager
class GUIChartManager extends ChartManager {
  constructor() {
    super();
    this.dialog = UI.draggableDialog('chart');
    UI.resizableDialog('chart', 'CHART_MANAGER');
    this.dialog.addEventListener('mousemove',
        (event) => CHART_MANAGER.showInfo(event.shiftKey));
    this.dialog.addEventListener('dragover',
        (event) => CHART_MANAGER.dragOver(event));
    this.dialog.addEventListener('drop',
        (event) => CHART_MANAGER.handleDrop(event));
    // Toolbar buttons
    document.getElementById('chart-close-btn').addEventListener(
        'click', (event) => UI.toggleDialog(event));
    document.getElementById('chart-rename-btn').addEventListener(
        'click', () => CHART_MANAGER.promptForTitle());
    document.getElementById('chart-clone-btn').addEventListener(
        'click', () => CHART_MANAGER.cloneChart());
    this.results_btn = document.getElementById('chart-results-btn');
    this.results_btn.addEventListener(
        'click', () => CHART_MANAGER.toggleRunResults());
    this.runstat_btn = document.getElementById('chart-runstat-btn');
    this.runstat_btn.addEventListener(
        'click', () => CHART_MANAGER.toggleRunStat());
    document.getElementById('chart-delete-btn').addEventListener(
        'click', () => CHART_MANAGER.deleteChart());
    this.control_panel = document.getElementById('chart-control-panel');
    this.chart_selector = document.getElementById('chart-selector');
    this.chart_selector.addEventListener(
        'change', () => CHART_MANAGER.selectChart());
    document.getElementById('chart-histogram').addEventListener(
        'click', () => CHART_MANAGER.toggleHistogram());    
    this.histogram_options = document.getElementById('chart-histogram-options');
    this.bins_selector = document.getElementById('histogram-bins');
    this.bins_selector.addEventListener(
        'change', () => CHART_MANAGER.changeBins());
    document.getElementById('chart-title').addEventListener(
        'click', () => CHART_MANAGER.toggleTitle());    
    this.legend_selector = document.getElementById('chart-legend');
    this.legend_selector.addEventListener(
        'change', () => CHART_MANAGER.changeLegend());
    document.getElementById('chart-add-variable-btn').addEventListener(
        'click', (event) => CHART_MANAGER.promptForVariable(event.shiftKey));
    document.getElementById('chart-variable-up-btn').addEventListener(
        'click', () => CHART_MANAGER.moveVariable(-1));
    document.getElementById('chart-variable-down-btn').addEventListener(
        'click', () => CHART_MANAGER.moveVariable(1));
    document.getElementById('chart-edit-variable-btn').addEventListener(
        'click', () => CHART_MANAGER.editVariable());
    document.getElementById('chart-sort-variable-btn').addEventListener(
        'mouseenter', () => CHART_MANAGER.showSortingMenu());
    document.getElementById('chart-delete-variable-btn').addEventListener(
        'click', () => CHART_MANAGER.deleteVariable());
    // Make the sorting menu responsive.
    this.sorting_menu = document.getElementById('chart-sorting-menu');
    this.sorting_menu.addEventListener(
        'mouseleave', () => CHART_MANAGER.hideSortingMenu());
    document.getElementById('chart-sort-not-btn').addEventListener(
        'click', (e) => CHART_MANAGER.setSortType(e.target));
    document.getElementById('chart-sort-asc-btn').addEventListener(
        'click', (e) => CHART_MANAGER.setSortType(e.target));
    document.getElementById('chart-sort-asc-lead-btn').addEventListener(
        'click', (e) => CHART_MANAGER.setSortType(e.target));
    document.getElementById('chart-sort-desc-btn').addEventListener(
        'click', (e) => CHART_MANAGER.setSortType(e.target));
    document.getElementById('chart-sort-desc-lead-btn').addEventListener(
        'click', (e) => CHART_MANAGER.setSortType(e.target));
    // Add properties for access to other chart manager dialog elements.
    this.variables_table = document.getElementById('chart-variables-table');
    this.display_panel = document.getElementById('chart-display-panel');
    this.toggle_chevron = document.getElementById('chart-toggle-chevron');
    this.table_panel = document.getElementById('chart-table-panel');
    this.statistics_table = document.getElementById('chart-table');
    this.svg_container = document.getElementById('chart-svg-container');
    this.svg_container.addEventListener(
        'mousemove', (event) => CHART_MANAGER.updateTimeStep(event, true));
    this.svg_container.addEventListener(
        'mouseleave', (event) => CHART_MANAGER.updateTimeStep(event, false));
    this.time_step = document.getElementById('chart-time-step');
    this.prefix_div = document.getElementById('chart-prefix-div');
    this.prefix_selector = document.getElementById('chart-prefix');
    this.prefix_selector.addEventListener(
        'change', () => CHART_MANAGER.selectPrefix());
    document.getElementById('chart-toggle-chevron').addEventListener(
        'click', () => CHART_MANAGER.toggleControlPanel());
    document.getElementById('chart-stats-btn').addEventListener(
        'click', () => CHART_MANAGER.toggleStatistics());
    document.getElementById('chart-copy-stats-btn').addEventListener(
        'click', () => CHART_MANAGER.copyStatistics());
    document.getElementById('chart-copy-data-btn').addEventListener(
        'click', () => CHART_MANAGER.copyData());
    document.getElementById('chart-copy-table-btn').addEventListener(
        'click', (event) => CHART_MANAGER.copyTable(event.shiftKey));
    document.getElementById('chart-save-btn').addEventListener(
        'click', () => CHART_MANAGER.downloadChart(event.shiftKey));
    document.getElementById('chart-widen-btn').addEventListener(
        'click', () => CHART_MANAGER.stretchChart(1));
    document.getElementById('chart-narrow-btn').addEventListener(
        'click', () => CHART_MANAGER.stretchChart(-1));

    // The Add variable modal.
    this.add_variable_modal = new ModalDialog('add-variable');
    this.add_variable_modal.ok.addEventListener(
        'click', () => CHART_MANAGER.addVariable());
    this.add_variable_modal.cancel.addEventListener(
        'click', () => CHART_MANAGER.add_variable_modal.hide());
    // NOTE: uses methods of the Expression Editor
    this.add_variable_modal.element('obj').addEventListener(
        'change', () => X_EDIT.updateVariableBar('add-'));
    this.add_variable_modal.element('name').addEventListener(
        'change', () => X_EDIT.updateAttributeSelector('add-'));

    // The Edit variable modal.
    this.variable_modal = new ModalDialog('variable');
    this.variable_modal.ok.addEventListener(
        'click', () => CHART_MANAGER.modifyVariable());
    this.variable_modal.cancel.addEventListener(
        'click', () => CHART_MANAGER.variable_modal.hide());
    this.change_equation_btns = document.getElementById('change-equation-btns');
    document.getElementById('chart-rename-equation-btn').addEventListener(
        'click', () => CHART_MANAGER.renameEquation());
    document.getElementById('chart-edit-equation-btn').addEventListener(
        'click', () => CHART_MANAGER.editEquation());
    document.getElementById('variable-color').addEventListener(
        'mouseenter', () => CHART_MANAGER.showPasteColor());
    document.getElementById('variable-color').addEventListener(
        'mouseleave', () => CHART_MANAGER.hidePasteColor());
    document.getElementById('variable-color').addEventListener(
        'click', (event) => CHART_MANAGER.copyPasteColor(event));
    // NOTE: Uses the color picker developed by James Daniel.
    this.color_picker = new iro.ColorPicker("#color-picker", {
        width: 115,
        height: 115,
        color: '#a00',
        markerRadius: 10,
        padding: 1,
        sliderMargin: 6,
        sliderHeight: 10,
        borderWidth: 1,
        borderColor: '#fff',
        anticlockwise: true
      });
    this.color_picker.on('input:end',
      () => {
        document.getElementById('variable-color').style.backgroundColor =
            CHART_MANAGER.color_picker.color.hexString;
      });

    // The Rename chart modal.
    this.rename_chart_modal = new ModalDialog('rename-chart');
    this.rename_chart_modal.ok.addEventListener(
        'click', () => CHART_MANAGER.renameChart());
    this.rename_chart_modal.cancel.addEventListener(
        'click', () => CHART_MANAGER.rename_chart_modal.hide());
    
    // The Add wildcard variables modal.
    this.add_wildcard_modal = new ModalDialog('add-wildcard-variables');
    this.add_wildcard_modal.ok.addEventListener(
        'click', () => CHART_MANAGER.addSelectedWildcardVariables());
    this.add_wildcard_modal.cancel.addEventListener(
        'click', () => CHART_MANAGER.add_wildcard_modal.hide());
    
    // Do not display the time step until cursor moves over chart
    this.time_step.style.display = 'none';
    document.getElementById('table-only-buttons').style.display = 'none';
    // Initialize properties
    this.reset();
  }

  reset() {
    // Basic reset (same as console-only class)
    this.visible = false;
    this.chart_index = -1;
    this.variable_index = -1;
    this.stretch_factor = 1;
    this.drawing_graph = false;
    // Clear the model-related DOM elements.
    this.chart_selector.innerHTML = '';
    this.variables_table.innerHTML = '';
    this.options_shown = true;
    this.setRunsChart(false);
    this.setRunsStat(false);
    this.last_time_selected = 0;
    this.paste_color = '';
    this.hideSortingMenu();
  }
  
  enterKey() {
    // Open "edit" dialog for the selected chart variable
    const srl = this.variables_table.getElementsByClassName('sel-set');
    if(srl.length > 0) {
      const r = this.variables_table.rows[srl[0].rowIndex];
      if(r) {
        // Emulate a double-click to edit the variable properties
        this.last_time_selected = Date.now();
        r.dispatchEvent(new Event('click'));
      }
    }
  }
  
  upDownKey(dir) {
    // Select row above or below the selected one (if possible)
    const srl = this.variables_table.getElementsByClassName('sel-set');
    if(srl.length > 0) {
      const r = this.variables_table.rows[srl[0].rowIndex + dir];
      if(r) {
        UI.scrollIntoView(r);
        r.dispatchEvent(new Event('click'));
      }
    }
  }
  
  setRunsChart(show) {
    // Indicates whether the chart manager should display a run result chart.
    this.runs_chart = show;
    if(show) {
      this.results_btn.classList.add('stay-activ');
      this.runstat_btn.style.display = 'inline-block';
    } else {
      this.results_btn.classList.remove('stay-activ');
      this.runstat_btn.style.display = 'none';
    }
  }

  setRunsStat(show) {
    // Indicates whether the chart manager should display run results
    // as bar chart (for runs and statistic selected in the Experiment
    // Manager).
    this.runs_stat = show;
    if(show) {
      this.runstat_btn.classList.add('stay-activ');
    } else {
      this.runstat_btn.classList.remove('stay-activ');
    }
  }

  showInfo(shift) {
    if(this.chart_index >= 0) {
      DOCUMENTATION_MANAGER.update(MODEL.charts[this.chart_index], shift);
    }
  }
  
  dragOver(ev) {
    const
        n = ev.dataTransfer.getData('text'),
        obj = MODEL.objectByID(n);
    if(obj) ev.preventDefault();
  }
  
  handleDrop(ev) {
    const
        n = ev.dataTransfer.getData('text'),
        obj = MODEL.objectByID(n);
    ev.preventDefault();
    if(!obj) {
      UI.alert(`Unknown entity ID "${n}"`);
    } else if(this.chart_index >= 0) {
      if(obj instanceof DatasetModifier) {
        // Equations can be added directly as chart variable
        this.addVariable(obj.selector);
        return;
      }
      // For other entities, the attribute must be specified
      this.add_variable_modal.show();
      const
          tn = VM.object_types.indexOf(obj.type),
          dn = obj.displayName;
      this.add_variable_modal.element('obj').value = tn;
      X_EDIT.updateVariableBar('add-');
      const s = this.add_variable_modal.element('name');
      let i = 0;
      for(let k in s.options) if(s.options.hasOwnProperty(k)) {
        if(s[k].text === dn) {
          i = s[k].value;
          break;
        }
      }
      s.value = i;
      X_EDIT.updateAttributeSelector('add-'); 
    }  
  }

  toggleControlPanel() {
    if(this.options_shown) {
      this.control_panel.style.display = 'none';
      this.display_panel.style.left = '1px';
      this.display_panel.style.width = 'calc(100% - 8px)';
      this.toggle_chevron.innerHTML = '&raquo;';
      this.toggle_chevron.title = 'Show control panel';
      this.options_shown = false;
    } else {
      this.control_panel.style.display = 'block';
      this.display_panel.style.left = '205px';
      this.display_panel.style.width = 'calc(100% - 212px)';
      this.toggle_chevron.innerHTML = '&laquo;';    
      this.toggle_chevron.title = 'Hide control panel';
      this.options_shown = true;
    }
    this.stretchChart(0);
  }
  
  updateSelector() {
    // Add one option to the selector for each chart defined for the model.
    // NOTE: Add the "new chart" option if it is not in the list.
    MODEL.addChart(this.new_chart_title);
    if(this.chart_index < 0) this.chart_index = 0;
    const ol = [];
    for(let i = 0; i < MODEL.charts.length; i++) {
      const t = MODEL.charts[i].title;
      ol.push(['<option value="', i,
          (i == this.chart_index ? '" selected="selected' : ''),
          '">', t , '</option>'].join(''));
    }
    // Sort option list by chart title.
    ol.sort((a, b) => {
        const
            re = /<option value="\d+"( selected="selected")?>(.+)<\/option>/,
            ta = a.replace(re, '$2'),
            tb = b.replace(re, '$2');
        return UI.compareFullNames(ta, tb);
      });
    this.chart_selector.innerHTML = ol.join('');
  }
  
  updateDialog() {
    // Refresh all dialog fields to display actual MODEL chart properties.
    this.updateSelector();
    this.prefix_div.style.display = 'none';
    let c = null;
    if(this.chart_index >= 0) {
      c = MODEL.charts[this.chart_index];
      UI.setBox('chart-histogram', c.histogram);
      this.bins_selector.value = c.bins;
      if(c.histogram) {
        this.histogram_options.style.display = 'block';
      } else {
        this.histogram_options.style.display = 'none';
      }
      UI.setBox('chart-title', c.show_title);
      const ol = [];
      for(const opt of this.legend_options) {
        const val = opt.toLowerCase();
        ol.push(['<option value="', val,
          (c.legend_position === val ? '" selected="selected' : ''),
          '">', opt, '</option>'].join(''));
      }
      this.legend_selector.innerHTML = ol.join('');
      ol.length = 0;
      for(let i = 0; i < c.variables.length; i++) {
        const cv = c.variables[i];
        ol.push(['<tr class="variable',
          (i === this.variable_index ? ' sel-set' : ''),
          '" title="', cv.displayName,
          '" onclick="CHART_MANAGER.selectVariable(', i, ');">',
          '<td class="v-box"><div id="v-box-', i, '" class="vbox',
          (cv.visible ? ' checked' : ' clear'),
          '" onclick="CHART_MANAGER.toggleVariable(', i,
          ', event);"></div></td><td class="v-name vbl-', cv.sorted,
          (cv.absolute ? ' vbl-abs' : ''), '">', cv.displayName,
          '</td></tr>'].join(''));
      }
      this.variables_table.innerHTML = ol.join('');
      const
          cp = c.prefix,
          pp = c.possiblePrefixes,
          html = [];
      if(pp.length) {
        for(const p of pp) {
          const cap = capitalized(p);
          html.push('<option value="', cap, '"', (cap === cp ? ' selected' : ''), '>',
              cap, '</option>');
        }
        this.prefix_div.style.display = 'inline-block';
      }
      this.prefix_selector.innerHTML = html.join('');
    } else {
      this.variable_index = -1;
    }
    // Just in case variable index has not been adjusted after some
    // variables have been deleted
    if(this.variable_index >= c.variables.length) {
      this.variable_index = -1;
    }
    // Set the image of the sort type button.
    if(this.variable_index >= 0) {
      const
          cv = c.variables[this.variable_index],
          sb = document.getElementById('chart-sort-variable-btn'),
          mb = document.getElementById(`chart-sort-${cv.sorted}-btn`); 
      sb.src = `images/sort-${cv.sorted}.png`;
      sb.title = mb.title;
    }
    const
        u_btn = 'chart-variable-up ',
        d_btn = 'chart-variable-down ',
        ed_btns = 'chart-edit-variable chart-sort-variable chart-delete-variable ';
    if(this.variable_index < 0) {
      UI.disableButtons(ed_btns + u_btn + d_btn);
    } else {
      UI.enableButtons(ed_btns);
      if(this.variable_index > 0) {
        UI.enableButtons(u_btn);
      } else {
        UI.disableButtons(u_btn);
      }
      if(c && this.variable_index < c.variables.length - 1) {
        UI.enableButtons(d_btn);
      } else {
        UI.disableButtons(d_btn);
      }
      // If the Edit variable dialog is showing, update its header.
      if(this.variable_index >= 0 && !UI.hidden('variable-dlg')) {
        document.getElementById('variable-dlg-name').innerHTML =
              c.variables[this.variable_index].displayName;
      }
    }
    // Finder dialog may need to update its "add variables to chart" button
    if(FINDER.visible) FINDER.updateDialog();
    this.add_variable_modal.element('obj').value = 0;
    // Update variable dropdown list of the "add variable" modal.
    X_EDIT.updateVariableBar('add-');
    this.stretchChart(0);
  }
  
  selectPrefix() {
    // Set the preferred prefix for this chart. This will override the
    // title prefix (if any).
    if(this.chart_index >= 0) {
      MODEL.charts[this.chart_index].preferred_prefix = this.prefix_selector.value;
    }
    this.updateDialog();
  }
  
  showSortingMenu() {
    // Show the pane with sort type buttons only if variable is selected.
    this.sorting_menu.style.display =
        (this.variable_index >= 0 ? 'block' : 'none');
  }
  
  hideSortingMenu() {
    // Hide the pane with sort type buttons.
    this.sorting_menu.style.display = 'none';
  }
  
  setSortType(btn) {
    // Set the sort type for the selected chart variable.
    if(this.chart_index < 0 || this.variable_index < 0) return;
    const
        c = MODEL.charts[this.chart_index],
        cv = c.variables[this.variable_index],
        parts = btn.id.split('-');
    parts.shift();
    parts.shift();
    parts.pop();
    cv.sorted = parts.join('-');
    this.hideSortingMenu();
    this.updateDialog();
  }
  
  updateExperimentInfo() {
    // Display selected experiment title in dialog header if run data
    // are used.
    const
        selx = EXPERIMENT_MANAGER.selected_experiment,
        el = document.getElementById('chart-experiment-info');
    if(selx && this.runs_chart) {
      el.innerHTML = '<em>Experiment:</em> ' + selx.title;
    } else {
      el.innerHTML = '';
    }
  }
    
  updateTimeStep(e, show) {
    // Shows the time step corresponding to the horizontal cursor position,
    // or hides it if the cursor is not over the chart area
    const c = (this.chart_index >= 0 ? MODEL.charts[this.chart_index] : null);
    if(show && c) {
      const
          scale = this.container_height / this.svg_height,
          r = c.chart_area_rect,
          ox = r.left * scale,
          w = r.width * scale,
          rect = this.svg_container.getBoundingClientRect(),
          x = e.pageX - rect.left + window.scrollX,
          y = e.pageY - rect.top + window.scrollY,
          yfract = (c.plot_oy - y / scale) / c.plot_height,
          yrange = c.plot_max_y - c.plot_min_y,
          yval = c.plot_min_y + yfract * yrange,
          yres = (yrange / rect.height).toPrecision(1),
          ysign = (yval < 0 ? '-' : ''),
          ytrunc = Math.abs(Math.round(yval / yres) * yres).toPrecision(3),
          ytruncf = parseFloat(ytrunc),
          yprec = (ytrunc.length > 7 ?
              ytruncf.toExponential(1) : ytruncf.toPrecision(2)),
          ystr = (Math.abs(parseFloat(yprec)) === 0 ? '0' : ysign + yprec),
          ylbl = (yfract < 0 || yfract > 1 || c.plot_min_y >= c.plot_max_y ?
              '' : 'y = ' + ystr);
      let n = '';
      if(c.histogram) {
        let vv = [];
        for(const v of c.variables) if(v.visible) vv.push(v);
        const
            l = vv.length,
            bars = c.bins * l,
            b = Math.max(0, Math.min(bars, Math.floor(bars * (x - ox) / w))),
            v = vv[b % l],
            t = Math.floor(b / l);
        if(x > ox && b < bars) n = 'N = ' + v.bin_tallies[t];
      } else if(this.runs_stat) {
        const
            runs = EXPERIMENT_MANAGER.selectedRuns(c),
            rcnt = runs.length,
            ri = Math.max(0, Math.min(rcnt, Math.floor(rcnt * (x - ox) / w)));
        if(x > ox && ri < rcnt) n = 'Run #' + runs[ri];
      } else if(x > ox - 5) {
        const
            runs = EXPERIMENT_MANAGER.selectedRuns(c),
            p = c.total_time_steps,
            first = (runs.length > 0 ? 1 : MODEL.start_period),
            last = (runs.length > 0 ? p : MODEL.end_period),
            t = Math.round(first - 0.5 + p * (x - ox) / w);
        if(t <= last) n = 't = ' + Math.max(0, t);
      }
      if(ylbl && n) {
        n += '<br>' + ylbl;
        this.time_step.style.marginTop = '-1px';
      } else {
        this.time_step.style.marginTop = '5px';
      }
      
      this.time_step.innerHTML = n;
      this.time_step.style.display = 'inline-block';
    } else {
      this.time_step.style.display = 'none';
    }
  }

  selectChart() {
    // Set the selected chart to be the "active" chart.
    const ci = parseInt(this.chart_selector.value);
    // Deselect variable only if different chart is selected.
    if(ci !== this.chart_index) this.variable_index = -1;
    this.chart_index = ci;
    this.updateDialog();
  }

  promptForTitle() {
    // Prompt modeler for a new title for the current chart.
    if(this.chart_index >= 0) {
      this.rename_chart_modal.show();
      const nct = document.getElementById('new-chart-title');
      nct.value = MODEL.charts[this.chart_index].displayName;
      nct.focus();
    }
  }

  renameChart() {
    // Rename the current chart.
    if(this.chart_index >= 0) {
      const t = UI.cleanName(document.getElementById('new-chart-title').value);
      // Check if a chart with this title already exists.
      const ci = MODEL.indexOfChart(t);
      if(ci >= 0 && ci != this.chart_index) {
        UI.warn(`A chart with title "${t}" already exists`);
      } else {
        const c = MODEL.charts[this.chart_index];
        // Remember the old title of the chart-to-be-renamed.
        const ot = c.title;
        c.title = t;
        // If the default '(new chart)' has been renamed, create a new one.
        if(ot === this.new_chart_title) {
          MODEL.addChart(ot);
        }
        // Update the chart index so that it points to the renamed chart.
        this.chart_index = MODEL.indexOfChart(t);
        this.updateSelector();
        // Redraw the chart if title is shown.
        if(c.show_title) this.drawChart();
      }
      // Update dialogs that may refer to this chart.
      UI.updateControllerDialogs('CFX');
    }
    this.rename_chart_modal.hide();
  }
  
  cloneChart() {
    // Create a new chart that is identical to the current one.
    if(this.chart_index < 0) return;
    const
        c = MODEL.charts[this.chart_index],
        pp = c.possiblePrefixes;
    let nt = c.title;
    if(pp) {
      // Remove title prefix (if any), and add selected one.
      nt = c.prefix + UI.PREFIXER + nt.split(UI.PREFIXER).pop();
    }
    // If title is not new, keep adding a suffix until it is new.
    while(MODEL.indexOfChart(nt) >= 0) nt += '-copy';
    const nc = MODEL.addChart(nt);
    // Copy properties of `c` to `nc`;
    nc.histogram = c.histogram;
    nc.bins = c.bins;
    nc.show_title = c.show_title;
    nc.legend_position = c.legend_position;
    for(const cv of c.variables) {
      const nv = new ChartVariable(nc);
      nv.setProperties(cv.object, cv.attribute, cv.stacked,
          cv.color, cv.scale_factor, cv.absolute, cv.line_width,
          cv.clipped, cv.visible, cv.sorted);
      nc.variables.push(nv);
    }
    this.chart_index = MODEL.indexOfChart(nc.title);
    this.updateDialog();
  }

  toggleRunResults() {
    // Toggle the Boolean property that signals charts that they must plot
    // run results if they are part of the selected experiment chart set.
    this.setRunsChart(!this.runs_chart);
    this.resetChartVectors();
    this.updateDialog();
  }
  
  toggleRunStat() {
    // Toggle the Boolean property that signals charts that they must
    // plot the selected statistic for the selected runs if they are
    // part of the selected experiment chart set.
    this.setRunsStat(!this.runs_stat);
    this.resetChartVectors();
    this.updateDialog();
  }
  
  deleteChart() {
    // Delete the shown chart (if any).
    if(this.chart_index >= 0) {
      MODEL.deleteChart(this.chart_index);
      // Also update the experiment viewer, because this chart may be
      // one of the output charts of the selected experiment.
      UI.updateControllerDialogs('CFX');
    }
  }
  
  changeBins() {
    if(this.chart_index >= 0) {
      const
          c = MODEL.charts[this.chart_index],
          b = parseInt(this.bins_selector.value);
      if(b !== c.bins) {
        c.bins = b;
        this.drawChart();
      }
    }
  }
  
  toggleHistogram() {
    if(this.chart_index >= 0) {
      const c = MODEL.charts[this.chart_index];
      c.histogram = !c.histogram;
      if(c.histogram) {
        this.histogram_options.style.display = 'block';
      } else {
        this.histogram_options.style.display = 'none';
      }
      this.drawChart();
    }    
  }
  
  toggleTitle() {
    // window.event.stopPropagation();
    if(this.chart_index >= 0) {
      const c = MODEL.charts[this.chart_index];
      c.show_title = !c.show_title;
      this.drawChart();
    }    
  }
  
  changeLegend() {
    if(this.chart_index >= 0) {
      const c = MODEL.charts[this.chart_index];
      c.legend_position = document.getElementById('chart-legend').value;
      this.drawChart();
    }        
  }
  
  promptForVariable(shift) {
    // Prompts for variable to add to chart
    // NOTE: shortcut (Shift-click) to add a new equation to the chart
    if(shift) {
      if(UI.hidden('equation-dlg')) {
        UI.buttons.equation.dispatchEvent(new Event('click'));
      }
      // NOTE: TRUE signals equation manager to add new equation to the chart
      EQUATION_MANAGER.promptForEquation(true);
    } else {
      this.add_variable_modal.show();
    }
  }

  addVariable(eq='') {
    // Add the variable specified by the add-variable-dialog to the chart.
    // NOTE: When defined, `eq` is the selector of the equation to be added.
    if(this.chart_index >= 0) {
      let o = '',
          a = eq;
      if(!eq) {
        o = this.add_variable_modal.selectedOption('name').text;
        a = this.add_variable_modal.selectedOption('attr').text;
      }
      // NOTE: When equation is added, object specifier is empty string.
      if(!o && a) o = UI.EQUATIONS_DATASET_NAME;
      this.variable_index = MODEL.charts[this.chart_index].addVariable(o, a);
      if(this.variable_index >= 0) {
        this.add_variable_modal.hide();
        // Also update the experiment viewer (charts define the output variables)
        if(EXPERIMENT_MANAGER.selected_experiment) {
          EXPERIMENT_MANAGER.selected_experiment.inferVariables();
        }
        UI.updateControllerDialogs('CFX');
      }
    }
  }
  
  promptForWildcardIndices(chart, dsm) {
    // Prompt modeler with list of vectors for wildcard dataset modifier
    // `dsm` as variables to `chart`.
    const
        md = this.add_wildcard_modal,
        indices = Object.keys(dsm.expression.wildcard_vectors);
    // First hide the "Add variable" modal.
    this.add_variable_modal.hide();
    // Do not prompt for selection if there is only 1 match.
    if(indices.length < 2) {
      if(indices.length) {
        chart.addWildcardVariables(dsm, indices);
      } else {
        UI.notify(`Variable "${dsm.displayName}" cannot be plotted`);
      }
      return;
    }
    md.chart = chart;
    md.modifier = dsm;
    md.indices = indices;
    const
        tr = [],
        dn = dsm.displayName,
        tbl = md.element('table');
    for(const index of indices) {
      tr.push('<tr><td class="v-box"><div id="wcv-box-', index,
          '" class="box clear" onclick="UI.toggleBox(event);"></td>',
          '<td class="vname">', dn.replace('??', index),
          '</td></tr>');
      tbl.innerHTML = tr.join('');
    }
    md.dialog.style.height = (22 + indices.length * 16) + 'px';
    md.show();
  }
  
  addSelectedWildcardVariables() {
    // Let the chart add selected wildcard matches (if any) as chart
    // variables.
    const
        md = this.add_wildcard_modal,
        c = md.chart,
        dsm = md.modifier,
        indices = [];
    if(c && dsm) {
      for(const index of md.indices) {
        if(UI.boxChecked('wcv-box-'+ index)) indices.push(index);
      }
    }
    if(indices.length) c.addWildcardVariables(dsm, indices);
    // Always hide the dialog.
    md.hide();
    this.updateDialog();
  }
  
  selectVariable(vi) {
    // Select variable, and edit it when double-clicked.
    const
        now = Date.now(),
        dt = now - this.last_time_selected;
    if(vi >= 0 && this.chart_index >= 0) {
      this.last_time_selected = now;
      if(vi === this.variable_index) {
        // Consider click to be "double" if it occurred less than 300 ms ago.
        if(dt < 300) {
          this.last_time_selected = 0;
          this.editVariable();
          return;
        }
      }
    }
    this.variable_index = vi;
    this.updateDialog();
  }
  
  setColorPicker(color) {
    // Robust way to set iro color picker color
    try {
      this.color_picker.color.hexString = color;
    } catch(e) {
      this.color_picker.color.rgbString = color;
    }
  }
  
  editVariable() {
    // Show the edit (or rather: format) variable dialog.
    if(this.chart_index >= 0 && this.variable_index >= 0) {
      const cv = MODEL.charts[this.chart_index].variables[this.variable_index];
      document.getElementById('variable-dlg-name').innerHTML = cv.displayName;
      UI.setBox('variable-absolute', cv.absolute);
      UI.setBox('variable-stacked', cv.stacked);
      UI.setBox('variable-clipped', cv.clipped);
      // Pass TRUE tiny flag to permit very small scaling factors.
      this.variable_modal.element('scale').value = VM.sig4Dig(cv.scale_factor, true);
      this.variable_modal.element('width').value = VM.sig4Dig(cv.line_width);
      this.variable_modal.element('color').style.backgroundColor = cv.color;
      this.setColorPicker(cv.color);
      // Show change equation buttons only for equation variables.
      if(cv.object === MODEL.equations_dataset || cv.object instanceof DatasetModifier) {
        this.change_equation_btns.style.display = 'block';
      } else {
        this.change_equation_btns.style.display = 'none';
      }
      this.variable_modal.show();
    }
  }
  
  showPasteColor() {
    // Show last copied color (if any) as smaller square next to color box.
    if(this.paste_color) {
      const pc = this.variable_modal.element('paste-color');
      pc.style.backgroundColor = this.paste_color;
      pc.style.display = 'inline-block';
    }
  }
  
  hidePasteColor() {
    // Hide paste color box.
    this.variable_modal.element('paste-color').style.display = 'none';
  }
  
  copyPasteColor(event) {
    // Store the current color as past color, or set it to the current
    // paste color if this is defined and the Shift key was pressed.
    event.stopPropagation();
    const cbox = this.variable_modal.element('color');
    if(event.shiftKey && this.paste_color) {
      cbox.style.backgroundColor = this.paste_color;
      this.setColorPicker(this.paste_color);
    } else {
      this.paste_color = cbox.style.backgroundColor;
      this.showPasteColor();
    }
  }
  
  toggleVariable(vi, event) {
    window.event.stopPropagation();
    if(vi >= 0 && this.chart_index >= 0) {
      const v_list = MODEL.charts[this.chart_index].variables;
      if(event.altKey) {
        // Special option: deselect all variables that have NO non-zero values.
        for(vi = 0; vi < v_list.length; vi++) {
          if(v_list[vi].non_zero_tally === 0) {
            v_list[vi].visible = false;
            UI.setBox('v-box-' + vi, false);
          }
        }
      } else {
        let from = vi,
            to = vi;
        // The visibility of the clicked variable determines the new value
        // also when a range is selected.
        const nv = !MODEL.charts[this.chart_index].variables[vi].visible;
        // Shift-click toggles range between selected and clicked variable.
        if(event.shiftKey &&
            this.variable_index >= 0 && this.variable_index !== vi) {
          if(vi > this.variable_index) {
            from = this.variable_index;
          } else {
            to = this.variable_index;
          }
        }
        for(vi = from; vi <= to; vi++) {
          v_list[vi].visible = nv;
          UI.setBox('v-box-' + vi, nv);
        }
      }
      // redraw chart and table (with one variable more or less)
      this.drawChart();
      // Also update the experiment viewer (charts define the output variables)
      if(EXPERIMENT_MANAGER.selected_experiment) {
        EXPERIMENT_MANAGER.updateDialog();
      }
    }
  }
  
  moveVariable(dir) {
    if(this.chart_index >= 0 && this.variable_index >= 0) {
      const c = MODEL.charts[this.chart_index];
      let vi = this.variable_index;
      if((dir > 0 && vi < c.variables.length - 1) || (dir < 0 && vi > 0)) {
        vi += dir;
        const v = c.variables.splice(this.variable_index, 1)[0];
        c.variables.splice(vi, 0, v);
        this.variable_index = vi;
      }
      this.updateDialog();
    }
  }
  
  modifyVariable() {
    if(this.variable_index >= 0) {
      const s = UI.validNumericInput('variable-scale', 'scale factor');
      if(!s) return;
      const w = UI.validNumericInput('variable-width', 'line width');
      if(!w) return;
      const
          c = MODEL.charts[this.chart_index],
          cv = c.variables[this.variable_index];
      cv.absolute = UI.boxChecked('variable-absolute');
      cv.stacked = UI.boxChecked('variable-stacked');
      cv.clipped = UI.boxChecked('variable-clipped');
      cv.scale_factor = s;
      // Prevent negative or near-zero line width.
      cv.line_width = Math.max(0.001, w);
      cv.color = this.color_picker.color.hexString;
      // NOTE: Clear the vector so it will be recalculated.
      cv.vector.length = 0;
    }
    this.variable_modal.hide();
    this.updateDialog();
  }
  
  renameEquation() {
    // Renames the selected variable (if it is an equation)
    if(this.chart_index >= 0 && this.variable_index >= 0) {
      const v = MODEL.charts[this.chart_index].variables[this.variable_index];
      if(v.object === MODEL.equations_dataset || v.object instanceof DatasetModifier) {
        const m = MODEL.equations_dataset.modifiers[UI.nameToID(v.attribute)];
        if(m instanceof DatasetModifier) {
          EQUATION_MANAGER.selected_modifier = m;
          EQUATION_MANAGER.promptForName();
        }
      }
    }
  }
  
  editEquation() {
    // Opens the expression editor for the selected variable (if equation)
    if(this.chart_index >= 0 && this.variable_index >= 0) {
      const v = MODEL.charts[this.chart_index].variables[this.variable_index];
      if(v.object === MODEL.equations_dataset || v.object instanceof DatasetModifier) {
        const m = MODEL.equations_dataset.modifiers[UI.nameToID(v.attribute)];
        if(m instanceof DatasetModifier) {
          EQUATION_MANAGER.selected_modifier = m;
          EQUATION_MANAGER.editEquation();
        }
      }
    }    
  }

  deleteVariable() {
    // Deletes the selected variable from the chart
    if(this.variable_index >= 0) {
      MODEL.charts[this.chart_index].variables.splice(this.variable_index, 1);
      this.variable_index = -1;
      this.updateDialog();
      // Also update the experiment viewer (charts define the output variables)
      // and finder dialog.
      if(EXPERIMENT_MANAGER.selected_experiment) UI.updateControllerDialogs('FX');
    }
    this.variable_modal.hide();
  }
  
  showChartImage(c) {
    // Display the SVG image for chart `c` (computed by this Chart object).
    if(c) document.getElementById('chart-svg').innerHTML = c.svg;
  }

  drawTable() {
    // Show the statistics on the chart variables.
    const html = [];
    let vbl = [];
    if(this.chart_index >= 0) vbl = MODEL.charts[this.chart_index].variables;
    // First get the (potentially floating point) numbers so that their format
    // can be made uniform per column.
    const data = [];
    let nr = 0;
    for(const v of vbl) {
      if(v.visible) {
        data.push([VM.sig4Dig(v.minimum), VM.sig4Dig(v.maximum),
            VM.sig4Dig(v.mean), VM.sig4Dig(Math.sqrt(v.variance)),
            VM.sig4Dig(v.sum)]);
        nr++;
      }
    }
    if(nr == 0 || this.drawing_chart) {
      this.table_panel.innerHTML = '<div id="no-chart-data">No data</div>';
      return;
    }
    // Process each of 5 columns separately.
    for(let c = 0; c < 5; c++) {
      const col = [];
      for(let r = 0; r < data.length; r++) {
        col.push(data[r][c]);
      }
      uniformDecimals(col);
      for(let r = 0; r < data.length; r++) {
        data[r][c] = col[r];
      }
    }
    html.push('<table id="chart-table">',
        '<tr><th style="text-align: left">Variable</th>',
        '<th>N</th><th style="font-size: 11px">MIN</th>',
        '<th style="font-size: 11px">MAX</th>',
        '<th>&mu;</th><th>&sigma;</th><th>&Sigma;</th>',
        '<th>&ne;0</th><th>&#x26A0;</th></tr>');
    nr = 0;
    for(const v of vbl) {
      if(v.visible) {
        // NOTE: While still solving, display t-1 as N.
        const n = Math.max(0, v.N);
        html.push('<tr><td class="v-name">', v.legendName, '</td><td>', n,
            '</td><td title="', v.minimum.toPrecision(8), '">', data[nr][0],
            '</td><td title="', v.maximum.toPrecision(8), '">', data[nr][1],
            '</td><td title="', v.mean.toPrecision(8), '">', data[nr][2],
            '</td><td title="', Math.sqrt(v.variance).toPrecision(8), '">', data[nr][3],
            '</td><td title="', v.sum.toPrecision(8), '">', data[nr][4],
            '</td><td>', v.non_zero_tally, '</td><td>', v.exceptions,
            '</td></tr>');
        nr++;
      }
    }
    html.push('</table>');
    this.table_panel.innerHTML = html.join('');
  }
  
  toggleStatistics() {
    const btn = document.getElementById('chart-stats-btn');
    let hs = 'Show';
    if(btn.classList.contains('stay-activ')) {
      btn.classList.remove('stay-activ');
    } else {
      btn.classList.add('stay-activ');
      hs = 'Hide';
    }
    btn.title = hs + ' descriptive statistics';
    UI.toggle('chart-only-buttons', 'inline-block');
    UI.toggle('table-only-buttons', 'inline-block');
    UI.toggle('chart-table-panel');
    UI.toggle('chart-svg-scroller');
    this.stretchChart(0);
  }
  
  stretchChart(delta) {
    this.stretch_factor = Math.max(1, Math.min(10, this.stretch_factor + delta));
    // NOTE: do not use 'auto', as this produces poor results
    document.getElementById('chart-svg-scroller').style.overflowX =
        (this.stretch_factor === 1 ? 'hidden' : 'scroll');
    const csc = document.getElementById('chart-svg-container');
    csc.style.width = (this.stretch_factor * 100 + '%');
    // Size the chart proportional to its the display area
    const style = window.getComputedStyle(csc);
    this.container_width = parseFloat(style.width);
    // If stretch factor > 1, the horizontal scroll bar takes up space,
    // but this is accounted for by the container style!
    this.container_height = parseFloat(style.height);
    this.drawChart();
    const
        nbtn = document.getElementById('chart-narrow-btn'),
        wbtn = document.getElementById('chart-widen-btn');
    if(this.stretch_factor < 2) {
      nbtn.classList.remove('enab');
      nbtn.classList.add('disab');
    } else {
      nbtn.classList.remove('disab');
      nbtn.classList.add('enab');
    }
    if(this.stretch_factor < 10) {
      wbtn.classList.remove('disab');
      wbtn.classList.add('enab');
    } else {
      wbtn.classList.remove('enab');
      wbtn.classList.add('disab');
    }
  }
  
  copyTable(plain) {
    UI.copyHtmlToClipboard(this.table_panel.innerHTML, plain);
    UI.notify('Table copied to clipboard (as ', (plain ? 'text' : 'HTML'), ')');
  }
  
  copyStatistics() {
    if(this.chart_index >= 0) {
      UI.copyStringToClipboard(
          MODEL.charts[this.chart_index].statisticsAsString);
    }
  }
  
  copyData() {
    if(this.chart_index >= 0) {
      UI.copyStringToClipboard(
          MODEL.charts[this.chart_index].dataAsString);
    }
  }
  
  downloadChart(shift) {
    // Pushe the SVG of the selected chart as file to the browser.
    if(this.chart_index >= 0) {
      const
          chart = MODEL.charts[this.chart_index],
          svg = chart.svg;
      // NOTE: Chart image file name will be based on chart title.
      if(shift) {
        FILE_MANAGER.pushOutSVG(svg, chart.title);
      } else {
        FILE_MANAGER.pushOutPNG(svg, chart.title);
      }
    }
  }

  drawChart() {
    // Display the selected chart unless an experiment is running, or
    // already busy with an earlier drawChart call.
    if(MODEL.running_experiment) {
      UI.notify(UI.NOTICE.NO_CHARTS);
    } else if(this.chart_index >= 0 && !this.drawing_chart) {
      this.drawing_chart = true;
      CHART_MANAGER.actuallyDrawChart();
    } else {
      console.log(`Skipped drawing chart "${MODEL.charts[this.chart_index].title}"`);
    }
  }
  
  actuallyDrawChart() {
    // Draw the chart, and reset the cursor when done
    MODEL.charts[this.chart_index].draw();
    this.drawing_chart = false;
    this.drawTable();
  }
  
} // END of class ChartManager

