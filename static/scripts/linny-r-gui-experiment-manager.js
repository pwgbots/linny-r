/*
Linny-R is an executable graphical specification language for (mixed integer)
linear programming (MILP) problems, especially unit commitment problems (UCP).
The Linny-R language and tool have been developed by Pieter Bots at Delft
University of Technology, starting in 2009. The project to develop a browser-
based version started in 2017. See https://linny-r.org for more information.

This JavaScript file (linny-r-gui-expmgr.js) provides the GUI functionality
for the Linny-R Experiment Manager dialog.

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

// CLASS GUIExperimentManager provides the experiment dialog functionality
class GUIExperimentManager extends ExperimentManager {
  constructor() {
    super();
    this.dialog = UI.draggableDialog('experiment');
    UI.resizableDialog('experiment', 'EXPERIMENT_MANAGER');
    this.new_btn = document.getElementById('xp-new-btn');
    this.new_btn.addEventListener(
        'click', () => EXPERIMENT_MANAGER.promptForExperiment());
    document.getElementById('xp-rename-btn').addEventListener(
        'click', () => EXPERIMENT_MANAGER.promptForName());
    this.view_btn = document.getElementById('xp-view-btn');
    this.view_btn.addEventListener(
        'click', () => EXPERIMENT_MANAGER.viewerMode());
    this.sel_order_btn = document.getElementById('xp-order-btn');
    this.sel_order_btn.addEventListener(
        'click', () => EXPERIMENT_MANAGER.showSelectorOrder());
    this.reset_btn = document.getElementById('xp-reset-btn');
    this.reset_btn.addEventListener(
        'click', () => EXPERIMENT_MANAGER.clearRunResults());
    document.getElementById('xp-delete-btn').addEventListener(
        'click', () => EXPERIMENT_MANAGER.deleteExperiment());
    this.default_message = document.getElementById('experiment-default-message');
    
    this.design = document.getElementById('experiment-design');
    this.experiment_table = document.getElementById('experiment-table');
    this.params_div = document.getElementById('experiment-params-div');
    this.dimension_table = document.getElementById('experiment-dim-table');
    this.chart_table = document.getElementById('experiment-chart-table');
    // NOTE: the Exclude input field responds to several events
    this.exclude = document.getElementById('experiment-exclude');
    this.exclude.addEventListener(
        'focus',  () => EXPERIMENT_MANAGER.editExclusions());
    this.exclude.addEventListener(
        'keyup', (event) => { if(event.key === 'Enter') event.target.blur(); });
    this.exclude.addEventListener(
        'blur', () => EXPERIMENT_MANAGER.setExclusions());

    // Viewer pane controls
    this.viewer = document.getElementById('experiment-viewer');
    this.viewer.addEventListener(
        'mousemove', (event) => EXPERIMENT_MANAGER.showInfo(-1, event.shiftKey));
    this.viewer_progress = document.getElementById('viewer-progress');
    this.start_btn = document.getElementById('xv-start-btn');
    this.start_btn.addEventListener(
        'click', () => EXPERIMENT_MANAGER.startExperiment());
    this.pause_btn = document.getElementById('xv-pause-btn');
    this.pause_btn.addEventListener(
        'click', () => EXPERIMENT_MANAGER.pauseExperiment());
    this.stop_btn = document.getElementById('xv-stop-btn');
    this.stop_btn.addEventListener(
        'click', () => EXPERIMENT_MANAGER.stopExperiment());

    // Make other dialog buttons responsive
    document.getElementById('experiment-close-btn').addEventListener(
        'click', (event) => UI.toggleDialog(event));
    document.getElementById('xp-d-add-btn').addEventListener(
        'click', () => EXPERIMENT_MANAGER.promptForParameter('dimension'));
    document.getElementById('xp-d-up-btn').addEventListener(
        'click', () => EXPERIMENT_MANAGER.moveDimension(-1));
    document.getElementById('xp-d-down-btn').addEventListener(
        'click', () => EXPERIMENT_MANAGER.moveDimension(1));
    document.getElementById('xp-d-settings-btn').addEventListener(
        'click', () => EXPERIMENT_MANAGER.editSettingsDimensions());
    document.getElementById('xp-d-iterator-btn').addEventListener(
        'click', () => EXPERIMENT_MANAGER.editIteratorRanges());
    document.getElementById('xp-d-combination-btn').addEventListener(
        'click', () => EXPERIMENT_MANAGER.editCombinationDimensions());
    document.getElementById('xp-d-actor-btn').addEventListener(
        'click', () => EXPERIMENT_MANAGER.editActorDimension());
    document.getElementById('xp-d-delete-btn').addEventListener(
        'click', () => EXPERIMENT_MANAGER.deleteParameter());
    document.getElementById('xp-c-add-btn').addEventListener(
        'click', () => EXPERIMENT_MANAGER.promptForParameter('chart'));
    document.getElementById('xp-c-delete-btn').addEventListener(
        'click', () => EXPERIMENT_MANAGER.deleteParameter());
    document.getElementById('xp-ignore-btn').addEventListener(
        'click', () => EXPERIMENT_MANAGER.showClustersToIgnore());
    document.getElementById('xv-back-btn').addEventListener(
        'click', () => EXPERIMENT_MANAGER.designMode());
    document.getElementById('xv-copy-btn').addEventListener(
        'click', () => EXPERIMENT_MANAGER.copyTableToClipboard());
    document.getElementById('xv-download-btn').addEventListener(
        'click', () => EXPERIMENT_MANAGER.promptForDownload());
    // The viewer's drop-down selectors
    this.viewer_variable = document.getElementById('viewer-variable');
    this.viewer_variable.addEventListener( 
        'change', () => EXPERIMENT_MANAGER.setVariable());
    this.viewer_statistic = document.getElementById('viewer-statistic');
    this.viewer_statistic.addEventListener( 
        'change', () => EXPERIMENT_MANAGER.setStatistic());
    this.viewer_scale = document.getElementById('viewer-scale');
    this.viewer_scale.addEventListener( 
        'change', () => EXPERIMENT_MANAGER.setScale());
    // The spin buttons
    document.getElementById('xp-cd-minus').addEventListener( 
        'click', () => EXPERIMENT_MANAGER.updateSpinner('c', -1));
    document.getElementById('xp-cd-plus').addEventListener( 
        'click', () => EXPERIMENT_MANAGER.updateSpinner('c', 1));
    document.getElementById('xp-sd-minus').addEventListener( 
        'click', () => EXPERIMENT_MANAGER.updateSpinner('s', -1));
    document.getElementById('xp-sd-plus').addEventListener( 
        'click', () => EXPERIMENT_MANAGER.updateSpinner('s', 1));
    // The color scale buttons have ID `xv-NN-scale` where NN defines the scale
    const csf = (event) =>
        EXPERIMENT_MANAGER.setColorScale(event.target.id.split('-')[1]);
    document.getElementById('xv-rb-scale').addEventListener('click', csf);
    document.getElementById('xv-br-scale').addEventListener('click', csf);
    document.getElementById('xv-rg-scale').addEventListener('click', csf);
    document.getElementById('xv-gr-scale').addEventListener('click', csf);
    document.getElementById('xv-no-scale').addEventListener('click', csf);

    // Create modal dialogs for the Experiment Manager
    this.new_modal = new ModalDialog('xp-new');
    this.new_modal.ok.addEventListener(
        'click', () => EXPERIMENT_MANAGER.newExperiment());
    this.new_modal.cancel.addEventListener(
        'click', () => EXPERIMENT_MANAGER.new_modal.hide());

    this.rename_modal = new ModalDialog('xp-rename');
    this.rename_modal.ok.addEventListener(
        'click', () => EXPERIMENT_MANAGER.renameExperiment());
    this.rename_modal.cancel.addEventListener(
        'click', () => EXPERIMENT_MANAGER.rename_modal.hide());
    
    this.sel_order_modal = new ModalDialog('sel-order');
    this.sel_order_modal.ok.addEventListener(
        'click', () => EXPERIMENT_MANAGER.modifySelectorOrder());
    this.sel_order_modal.cancel.addEventListener(
        'click', () => EXPERIMENT_MANAGER.sel_order_modal.hide());
    this.sel_order_lines = this.sel_order_modal.element('lines');

    this.parameter_modal = new ModalDialog('xp-parameter');
    this.parameter_modal.ok.addEventListener(
        'click', () => EXPERIMENT_MANAGER.addParameter());
    this.parameter_modal.cancel.addEventListener(
        'click', () => EXPERIMENT_MANAGER.parameter_modal.hide());

    this.iterator_modal = new ModalDialog('xp-iterator');
    this.iterator_modal.ok.addEventListener(
        'click', () => EXPERIMENT_MANAGER.modifyIteratorRanges());
    this.iterator_modal.cancel.addEventListener(
        'click', () => EXPERIMENT_MANAGER.iterator_modal.hide());

    this.settings_modal = new ModalDialog('xp-settings');
    this.settings_modal.close.addEventListener(
        'click', () => EXPERIMENT_MANAGER.closeSettingsDimensions());
    this.settings_modal.element('s-add-btn').addEventListener(
        'click', () => EXPERIMENT_MANAGER.editSettingsSelector(-1));
    this.settings_modal.element('d-add-btn').addEventListener(
        'click', () => EXPERIMENT_MANAGER.editSettingsDimension(-1));

    this.settings_selector_modal = new ModalDialog('xp-settings-selector');
    this.settings_selector_modal.ok.addEventListener(
        'click', () => EXPERIMENT_MANAGER.modifySettingsSelector());
    this.settings_selector_modal.cancel.addEventListener(
        'click', () => EXPERIMENT_MANAGER.settings_selector_modal.hide());

    this.settings_dimension_modal = new ModalDialog('xp-settings-dimension');
    this.settings_dimension_modal.ok.addEventListener(
        'click', () => EXPERIMENT_MANAGER.modifySettingsDimension());
    this.settings_dimension_modal.cancel.addEventListener(
        'click', () => EXPERIMENT_MANAGER.settings_dimension_modal.hide());

    this.combination_modal = new ModalDialog('xp-combination');
    this.combination_modal.close.addEventListener(
        'click', () => EXPERIMENT_MANAGER.closeCombinationDimensions());
    this.combination_modal.element('s-add-btn').addEventListener(
        'click', () => EXPERIMENT_MANAGER.editCombinationSelector(-1));
    this.combination_modal.element('d-add-btn').addEventListener(
        'click', () => EXPERIMENT_MANAGER.editCombinationDimension(-1));

    this.combination_selector_modal = new ModalDialog('xp-combination-selector');
    this.combination_selector_modal.ok.addEventListener(
        'click', () => EXPERIMENT_MANAGER.modifyCombinationSelector());
    this.combination_selector_modal.cancel.addEventListener(
        'click', () => EXPERIMENT_MANAGER.combination_selector_modal.hide());

    this.combination_dimension_modal = new ModalDialog('xp-combination-dimension');
    this.combination_dimension_modal.ok.addEventListener(
        'click', () => EXPERIMENT_MANAGER.modifyCombinationDimension());
    this.combination_dimension_modal.cancel.addEventListener(
        'click', () => EXPERIMENT_MANAGER.combination_dimension_modal.hide());

    this.actor_dimension_modal = new ModalDialog('xp-actor-dimension');
    this.actor_dimension_modal.close.addEventListener(
        'click', () => EXPERIMENT_MANAGER.closeActorDimension());
    this.actor_dimension_modal.element('add-btn').addEventListener(
        'click', () => EXPERIMENT_MANAGER.editActorSelector(-1));

    this.actor_selector_modal = new ModalDialog('xp-actor-selector');
    this.actor_selector_modal.ok.addEventListener(
        'click', () => EXPERIMENT_MANAGER.modifyActorSelector());
    this.actor_selector_modal.cancel.addEventListener(
        'click', () => EXPERIMENT_MANAGER.actor_selector_modal.hide());

    this.clusters_modal = new ModalDialog('xp-clusters');
    this.clusters_modal.ok.addEventListener(
        'click', () => EXPERIMENT_MANAGER.modifyClustersToIgnore());
    this.clusters_modal.cancel.addEventListener(
        'click', () => EXPERIMENT_MANAGER.clusters_modal.hide());
    this.clusters_modal.element('add-btn').addEventListener(
        'click', () => EXPERIMENT_MANAGER.addClusterToIgnoreList());
    const sinp = this.clusters_modal.element('selectors');
    sinp.addEventListener(
        'focus', () => EXPERIMENT_MANAGER.editIgnoreSelectors());
    sinp.addEventListener(
        'keyup', (event) => {
            if (event.key === 'Enter') {
              event.stopPropagation();
              event.target.blur();
            }
          });
    sinp.addEventListener(
        'blur', () => EXPERIMENT_MANAGER.setIgnoreSelectors());
    this.clusters_modal.element('delete-btn').addEventListener(
        'click', () => EXPERIMENT_MANAGER.deleteClusterFromIgnoreList());

    this.download_modal = new ModalDialog('xp-download');
    this.download_modal.ok.addEventListener(
        'click', () => EXPERIMENT_MANAGER.downloadDataAsCSV());
    this.download_modal.cancel.addEventListener(
        'click', () => EXPERIMENT_MANAGER.download_modal.hide());

    // Initialize properties
    this.reset();
  }

  reset() {
    super.reset();
    this.selected_parameter = '';
    this.edited_selector_index = -1;
    this.edited_dimension_index = -1;
    this.edited_combi_selector_index = -1;
    this.color_scale = new ColorScale('no');
    this.clearColorScales();
    this.focal_table = null;
    this.designMode();
  }
  
  upDownKey(dir) {
    // Select row above or below the selected one (if possible)
    const srl = this.focal_table.getElementsByClassName('sel-set');
    if(srl.length > 0) {
      const r = this.focal_table.rows[srl[0].rowIndex + dir];
      if(r) {
        UI.scrollIntoView(r);
        r.dispatchEvent(new Event('click'));
      }
    }
  }
  
  updateDialog() {
    this.updateChartList();
    // Warn modeler if no meaningful experiments can be defined.
    if(MODEL.outcomeNames.length === 0 && this.suitable_charts.length === 0) {
      this.default_message.style.display = 'block';
      this.params_div.style.display = 'none';
      this.selected_experiment = null;
      // Disable experiment dialog menu buttons.
      UI.disableButtons('xp-new xp-rename xp-view xp-delete xp-ignore');
    } else {
      this.default_message.style.display = 'none';
      UI.enableButtons('xp-new');
      if(MODEL.experiments.length === 0) this.selected_experiment = null;
    }
    const
        xl = [],
        xtl = [],
        sx = this.selected_experiment;
    for(const x of MODEL.experiments) xtl.push(x.title);
    xtl.sort(ciCompare);
    for(const xt of xtl) {
      const
          xi = MODEL.indexOfExperiment(xt),
          x = (xi < 0 ? null : MODEL.experiments[xi]);
      xl.push(['<tr class="experiment',
          (x == sx ? ' sel-set' : ''),
          '" onclick="EXPERIMENT_MANAGER.selectExperiment(\'',
          escapedSingleQuotes(xt),
          '\');" onmouseover="EXPERIMENT_MANAGER.showInfo(', xi,
          ', event.shiftKey);"><td>', x.title, '</td></tr>'].join(''));
    }
    this.experiment_table.innerHTML = xl.join('');
    const
        btns = 'xp-rename xp-view xp-delete xp-ignore',
        icnt = document.getElementById('xp-ignore-count');
    icnt.innerHTML = '';      
    icnt.title = '';
    if(sx) {
      UI.enableButtons(btns);
      const nc = sx.clusters_to_ignore.length;
      if(Object.keys(MODEL.clusters).length <= 1) {
        // Disable ignore button if model comprises only the top cluster
        UI.disableButtons('xp-ignore');
      } else if(nc > 0) {
        icnt.innerHTML = nc;
        icnt.title = pluralS(nc, 'cluster') + ' set to be ignored';
      }
    } else {
      UI.disableButtons(btns);
    }
    // Show the "clear results" button only when selected experiment has run
    if(sx && sx.runs.length > 0) {
      document.getElementById('xp-reset-btn').classList.remove('off');
    } else {
      document.getElementById('xp-reset-btn').classList.add('off');
    }
    this.updateParameters();
    // NOTE: When UpdateDialog is called after an entity has been renamed,
    // its variable list should be updated.
    this.updateViewerVariable();
    // NOTE: Finder may need updating as well.
    if(FINDER.experiment_view) FINDER.updateDialog();
  }

  updateParameters() {
    MODEL.inferDimensions();
    let canview = true;
    const
        dim_count = document.getElementById('experiment-dim-count'),
        combi_count = document.getElementById('experiment-combi-count'),
        header = document.getElementById('experiment-params-header'),
        x = this.selected_experiment;
    if(!x) {
      dim_count.innerHTML = pluralS(
          MODEL.dimensions.length, ' data dimension') + ' in model';
      combi_count.innerHTML = '';
      header.innerHTML = '(no experiment selected)';
      this.params_div.style.display = 'none';
      return;
    }
    x.updateActorDimension();
    x.updateIteratorDimensions();
    x.inferAvailableDimensions(); 
    dim_count.innerHTML = pluralS(x.available_dimensions.length,
        'more dimension');
    x.inferActualDimensions();
    for(const ad of x.actual_dimensions) ad.sort(compareSelectors);
    x.inferCombinations();
    //x.combinations.sort(compareCombinations);
    combi_count.innerHTML = pluralS(x.combinations.length, 'combination');
    if(x.combinations.length === 0) canview = false;
    header.innerHTML = x.title;
    this.params_div.style.display = 'block';
    const
        tr = [],
        dsl = setStringList(x.dimensions);
    for(let i = 0; i < dsl.length; i++) {
      const pi = 'd' + i;
      tr.push(['<tr class="dataset',
          // Highlight selected dimension with background color.
          (this.selected_parameter == pi ? ' sel-set' : ''),
          // Show dimension in bold purple if it is a plot dimension.
          (x.plot_dimensions.indexOf(i) >= 0 ? ' def-sel' : ''),
          '" onclick="EXPERIMENT_MANAGER.selectParameter(\'', pi,
          // Click selects, shift-click will also toggle plot/no plot.
          '\', event.shiftKey);"><td>', dsl[i], '</td></tr>'].join(''));
    }
    this.dimension_table.innerHTML = tr.join('');
    // Add button must be enabled only if there still are unused dimensions
    if(x.available_dimensions.length > 0) {
      document.getElementById('xp-d-add-btn').classList.remove('v-disab');
    } else {
      document.getElementById('xp-d-add-btn').classList.add('v-disab');
    }
    this.updateUpDownButtons();
    tr.length = 0;
    for(let i = 0; i < x.charts.length; i++) {
      tr.push(['<tr class="dataset',
          (this.selected_parameter == 'c'+i ? ' sel-set' : ''),
          '" onclick="EXPERIMENT_MANAGER.selectParameter(\'c',
          i, '\');"><td>',
          x.charts[i].title, '</td></tr>'].join(''));
    }
    this.chart_table.innerHTML = tr.join('');
    // Do not show viewer unless at least 1 dependent variable has been defined.
    if(x.charts.length === 0 && MODEL.outcomeNames.length === 0) canview = false;
    if(tr.length >= this.suitable_charts.length) {
      document.getElementById('xp-c-add-btn').classList.add('v-disab');
    } else {
      document.getElementById('xp-c-add-btn').classList.remove('v-disab');
    }
    this.exclude.value = x.excluded_selectors;
    const
        dbtn = document.getElementById('xp-d-delete-btn'),
        cbtn = document.getElementById('xp-c-delete-btn');
    if(this.selected_parameter.startsWith('d')) {
      dbtn.classList.remove('v-disab');
      cbtn.classList.add('v-disab');
    } else if(this.selected_parameter.startsWith('c')) {
      dbtn.classList.add('v-disab');
      cbtn.classList.remove('v-disab');
    } else {
      dbtn.classList.add('v-disab');
      cbtn.classList.add('v-disab');
    }
    // Enable viewing only if > 1 dimensions and > 1 outcome variables.
    if(canview) {
      UI.enableButtons('xp-view');
    } else {
      UI.disableButtons('xp-view');
    }
  }

  promptForExperiment() {
    if(this.new_btn.classList.contains('enab')) {
      this.new_modal.element('name').value = '';
      this.new_modal.show('name');
    }
  }
  
  newExperiment() {
    // NOTE: Title must be a "clean" name: no \ or | and spacing reduced to
    // a single space to permit using it unambiguously in experiment result
    // specifiers of variable names.
    const n = UI.cleanName(this.new_modal.element('name').value);
    if(n) {
      const x = MODEL.addExperiment(n);
      if(x) {
        this.new_modal.hide();
        this.selected_experiment = x;
        this.updateDialog();
      }
    } else {
      this.new_modal.element('name').focus();
      return;
    }
  }
  
  promptForName() {
    if(this.selected_experiment) {
      this.rename_modal.element('name').value = '';
      this.rename_modal.show('name');
    }
  }
  
  selectExperiment(title) {
    super.selectExperiment(title);
    // When experiment is selected, Finder permits viewing results.
    FINDER.updateDialog();
  }
  
  renameExperiment() {
    if(this.selected_experiment) {
      const
          nel = this.rename_modal.element('name'),
          n = UI.cleanName(nel.value);
      // Show modeler the "cleaned" new name.
      nel.value = n;
      // Keep prompt open if cleaned title is empty string, or identifies
      // an existing experiment.
      nel.focus();
      if(n) {
        // Warn modeler if name already in use for some experiment, other than
        // the selected experiment (as upper/lower case changes must be possible).
        if(MODEL.indexOfExperiment(n) >= 0 &&
            n.toLowerCase() !== this.selected_experiment.title.toLowerCase()) {
          UI.warn(`An experiment with title "${n}" already exists`);
        } else {
          this.selected_experiment.title = n;
          this.rename_modal.hide();
          this.updateDialog();
        }
      }
    }
  }

  showSelectorOrder() {
    // Show selector order modal.
    this.sel_order_lines.value = MODEL.selector_order_string;
    this.sel_order_modal.show();
  }
  
  modifySelectorOrder() {
    // Save text area contents as new selector order string.
    MODEL.selector_order_string = this.sel_order_lines.value.trim();
    MODEL.selector_order_list = MODEL.selector_order_string.trim().split(/\s+/);
    this.sel_order_modal.hide();
    UI.updateControllerDialogs('DX');
  }

  designMode() {
    // Switch to default view.
    this.viewer.style.display = 'none';
    this.design.style.display = 'block';
  }
  
  viewerMode() {
    // Switch to table view
    // NOTE: check if button is disabled, as it then still responds to click
    if(this.view_btn.classList.contains('disab')) return;
    const x = this.selected_experiment;
    if(x) {
      this.design.style.display = 'none';
      document.getElementById('viewer-title').innerHTML = x.title;
      this.viewer_statistic.value = x.selected_statistic;
      this.updateViewerVariable();
      // NOTE: calling updateSpinner with dir=0 will update without changes
      this.updateSpinner('c', 0);
      this.drawTable(); 
      this.viewer_scale.value = x.selected_scale;
      this.setColorScale(x.selected_color_scale);
      this.viewer.style.display = 'block';
    }
  }
  
  updateViewerVariable() {
    // Update the variable drop-down selector of the viewer.
    const x = this.selected_experiment;
    if(x) {
      x.inferVariables();
      const
          ol = [],
          ov = MODEL.outcomeNames,
          vl = [...ov];
      for(const v of x.variables) {
        const
            vn = v.displayName,
            oi = ov.indexOf(vn);
        // If an outcome dataset or equation is plotted in an experiment
        // chart, remove its name from the outcome variable list.
        if(oi >= 0) ov.splice(oi, 1);
        addDistinct(vn, vl); 
      }
      vl.sort((a, b) => UI.compareFullNames(a, b));
      // NOTE: When the selected variable entity has been renamed, its
      // name will not be in the list (and its old name cannot be inferred)
      // so then clear it.
      if(vl.indexOf(x.selected_variable) < 0) x.selected_variable = '';
      for(const vn of vl) {
        // NOTE: FireFox selector dropdown areas have a pale gray
        // background that darkens when color is set, so always set it
        // to white (like Chrome). Then set color of outcome variables
        // to fuchsia to differentiate from variables for which time
        // series are stored as experiment run results.
        ol.push(['<option value="', vn, '" style="background-color: white',
            (ov.indexOf(vn) >= 0 ? '; color: #b00080"' : '"'),
            (vn == x.selected_variable ? ' selected="selected"' : ''),
            '>', vn, '</option>'].join(''));
      }
      this.viewer_variable.innerHTML = ol.join('');
      // Initially, select the first variable on the list.
      if(x.selected_variable === '') x.selected_variable = vl[0];
    }
  }
  
  drawTable() {
    // Draw experimental design as table.
    const x = this.selected_experiment;
    if(x) {
      this.clean_columns = [];
      this.clean_rows = [];
      // Calculate the actual number of columns and rows of the table.
      const
          coldims = x.configuration_dims + x.column_scenario_dims,
          rowdims = x.actual_dimensions.length - coldims,
          excsel = x.excluded_selectors.split(' ');
      let nc = 1,
          nr = 1;
      for(let i = 0; i < coldims; i++) {
        const d = complement(x.actual_dimensions[i], excsel);
        if(d.length > 0) {
          nc *= d.length;
          this.clean_columns.push(d);
        }
      }
      for(let i = coldims; i < x.actual_dimensions.length; i++) {
        const d = complement(x.actual_dimensions[i], excsel);
        if(d.length > 0) {
          nr *= d.length;
          this.clean_rows.push(d);
        }
      }
      const
          tr = [],
          trl = [],
          cfgd = x.configuration_dims,
          // Opacity decrement to "bleach" yellow shades
          ystep = (cfgd > 1 ? 0.8 / (cfgd - 1) : 0),
          // NOTE: # blue shades needed is *lowest* of # column scenario
          // dimensions and # row dimensions
          scnd = Math.max(coldims - cfgd, rowdims),
          // Opacity decrement to "bleach" blue shades
          bstep = (scnd > 1 ? 0.8 / (scnd - 1) : 0);
      let
          // Index for leaf configuration numbering
          cfgi = 0,
          // Blank leading cell to fill the spcace left of configuration labels
          ltd = rowdims > 0 ? `<td colspan="${rowdims + 1}"></td>` : '';
      // Add the configurations label if there are any ...
      if(cfgd > 0) {
        trl.push('<tr>', ltd, '<th class="conf-ttl" colspan="',
            nc, '">Configurations</th></tr>');
      } else if(coldims > 0) {
      // ... otherwise add the scenarios label if there are any
        trl.push('<tr>', ltd,  '<th class="scen-h-ttl" colspan="', 
            nc,  '">Scenario space</th></tr>');
      }
      // Add the column label rows
      let n = 1,
          c = nc,
          style,
          cfgclass,
          selclass,
          onclick;
      for(let i = 0; i < coldims; i++) {
        const scnt = this.clean_columns[i].length;
        tr.length = 0;
        tr.push('<tr>', ltd);
        c = c / scnt;
        const csp = (c > 1 ? ` colspan="${c}"` : '');
        cfgclass = '';
        if(i < cfgd) {
          const perc = 1 - i * ystep;
          style = `background-color: rgba(250, 250, 0, ${perc});` +
              `filter: hue-rotate(-${25 * perc}deg)`;
          if(i === cfgd - 1)  cfgclass = ' leaf-conf';
        } else {
          style = 'background-color: rgba(100, 170, 255, ' +
              (1 - (i - cfgd) * bstep) + ')';
          if(i == coldims - 1) style += '; border-bottom: 1.5px silver inset';
        }
        for(let j = 0; j < n; j++) {
          for(let k = 0; k < scnt; k++) {
            if(i == cfgd - 1) {
              onclick = ` onclick="EXPERIMENT_MANAGER.setReference(${cfgi});"`;
              selclass = (cfgi == x.reference_configuration ? ' sel-leaf' : '');
              cfgi++;
            } else {
              onclick = '';
              selclass = '';
            }
            tr.push(['<th', csp, ' class="conf-hdr', cfgclass, selclass,
                '" style="', style, '"', onclick, '>', this.clean_columns[i][k],
                '</th>'].join(''));
          }
        }
        tr.push('</tr>');
        trl.push(tr.join(''));
        n *= scnt;
      }
      // Retain the number of configurations, as it is used in data display
      this.nr_of_configurations = cfgi;
      // Add the row scenarios
      const
          srows = [],
          rowsperdim = [1];
      // Calculate for each dimension how many rows it takes per selector
      for(let i = 1; i < rowdims; i++) {
        for(let j = 0; j < i; j++) {
          rowsperdim[j] *= this.clean_rows[i].length;
        }
        rowsperdim.push(1);
      }
      for(let i = 0; i < nr; i++) {
        srows.push('<tr>');
        // Add scenario title row if there are still row dimensions
        if(i == 0 && coldims < x.actual_dimensions.length) {
          srows[i] += '<th class="scen-v-ttl" rowspan="' + nr +
              '"><div class="v-rot">Scenario space</div></th>';
        }
        // Only add the scenario dimension header cell when appropriate,
        // and then give then the correct "rowspan"
        let lth = '', rsp;
        for(let j = 0; j < rowdims; j++) {
          // If no remainder of division, add the selector
          if(i % rowsperdim[j] === 0) {
            if(rowsperdim[j] > 1) {
              rsp = ` rowspan="${rowsperdim[j]}"`;
            } else {
              rsp = '';            
            }
            // Calculate the dimension selector index.
            const dsi = Math.floor(
                i / rowsperdim[j]) % this.clean_rows[j].length;
            lth += ['<th', rsp, ' class="scen-hdr" style="background-color: ',
                'rgba(100, 170, 255, ', 1 - j * bstep,
                ')" onclick="EXPERIMENT_MANAGER.toggleChartRow(', i,
                ', ', rowsperdim[j], ', event.shiftKey);">',
                this.clean_rows[j][dsi], '</th>'].join('');
          }
        }
        srows[i] += lth;
        for(let j = 0; j < nc; j++) {
          const run = i + j*nr;
          srows[i] += ['<td id="xr', run, '" class="data-cell not-run"',
              ' onclick="EXPERIMENT_MANAGER.toggleChartCombi(', run,
              ', event.shiftKey, event.altKey);" ',
              'onmouseover="EXPERIMENT_MANAGER.showRunInfo(',
              run, ', event.shiftKey);">', run, '</td>'].join('');                
        }
        srows[i] += '</tr>';        
      }
      trl.push(srows.join(''));
      document.getElementById('viewer-table').innerHTML = trl.join('');
      // NOTE: grid cells are identifiable by their ID => are updated separately
      this.updateData();
    }
  }
  
  toggleChartRow(r, n=1, shift=false) {
    // Toggle `n` consecutive rows, starting at row `r` (0 = top), to be
    // (no longer) part of the chart combination set.
    // @@TO DO: shift-key indicates "add row(s) to selection"
    if(MODEL.running_experiment) {
      // NOTE: do NOT change run selection while VM is solving!
      UI.notify('Run selection cannot be changed when an experiment is running');
      return;
    }
    const
        x = this.selected_experiment,
        // Let `first` be the number of the first run on row `r`.
        ncols = this.nr_of_configurations,
        nrows = x.combinations.length / ncols;
    if(x && r < nrows) {
      // NOTE: First cell in rows determines ADD or REMOVE.
      const add = shift || x.chart_combinations.indexOf(r) < 0;
      if(!shift) x.chart_combinations.length = 0;
      for(let i = 0; i < ncols; i++) {
        for(let j = 0; j < n; j++) {
          const
              c = r + j + i * nrows,
              run = x.runs[c],
              ic = x.chart_combinations.indexOf(c);
          // NOTE: Only add if run has been executed and stored.
          if(add && run) {
            if(ic < 0) x.chart_combinations.push(c);
          } else {
            if(ic >= 0) x.chart_combinations.splice(ic, 1);        
          }
        }
      }
      this.updateData();
      CHART_MANAGER.resetChartVectors();
      CHART_MANAGER.updateDialog();
      // NOTE: Finder may need updating as well.
      if(FINDER.experiment_view) FINDER.updateDialog();
    }
  }

  toggleChartColumn(c, shift) {
    // Toggle column `c` (0 = leftmost) to be part of the chart combination set
  }
  
  toggleChartCombi(n, shift, alt) {
    // Set `n` to be the chart combination, or toggle if Shift-key is pressed,
    // or execute single run if Alt-key is pressed.
    if(MODEL.running_experiment) {
      // NOTE: do NOT do this while VM is solving, as this would interfere!
      UI.notify('Run selection cannot be changed when an experiment is running');
      return;
    }
    const x = this.selected_experiment;
    if(x && alt && n >= 0) {
      this.startExperiment(n);
      return;
    }
    if(x && n < x.combinations.length) {
      // Toggle => add if not in selection, otherwise remove.
      const ci = x.chart_combinations.indexOf(n);
      if(ci < 0) {
        // Clear current selection unless Shift-key is pressed.
        if(!shift) x.chart_combinations.length = 0;
        x.chart_combinations.push(n);
      } else {
        x.chart_combinations.splice(ci, 1);
      }
    }
    this.updateData();
    // Show the messages for this run in the monitor.
    VM.setRunMessages(n);
    // Update the chart.
    CHART_MANAGER.resetChartVectors();
    CHART_MANAGER.updateDialog();
    // NOTE: Finder may need updating as well.
    if(FINDER.experiment_view) FINDER.updateDialog();
  }
  
  runInfo(n) {
    // Return information on the n-th combination as object {title, html}
    const
        x = this.selected_experiment,
        info = {};
    if(x && n < x.combinations.length) {
      const combi = x.combinations[n];
      info.title = `Combination: <tt>${tupelString(combi)}</tt>`;
      const html = [], list = [];
      for(const sel of combi) {
        html.push('<h3>Selector <tt>', sel, '</tt></h3>');
        // List associated model settings (if any).
        list.length = 0;
        for(const ss of x.settings_selectors) {
          const tuple = ss.split('|');
          if(sel === tuple[0]) list.push(tuple[1]);
        }
        if(list.length > 0) {
          html.push('<p><em>Model settings:</em> <tt>', list.join(';'),
              '</tt></p>');
        }
        // List associated actor settings (if any).
        list.length = 0;
        for(const as of x.actor_selectors) {
          if(sel === as.selector) list.push(as.round_sequence);
        }
        if(list.length > 0) {
          html.push('<p><em>Actor settings:</em> <tt>', list.join(';'),
              '</tt></p>');
        }
        // List associated datasets (if any).
        list.length = 0;
        for(let id in MODEL.datasets) if(MODEL.datasets.hasOwnProperty(id)) {
          const ds = MODEL.datasets[id];
          for(let k in ds.modifiers) if(ds.modifiers.hasOwnProperty(k)) {
            if(ds.modifiers[k].match(sel)) {
              list.push('<li>', ds.displayName, '<span class="dsx">',
                  ds.modifiers[k].expression.text,'</span></li>');
            }
          }
        }
        if(list.length > 0) {
          html.push('<em>Datasets:</em> <ul>', list.join(''), '</ul>');
        }
      }
      info.html = html.join('');
      return info;
    }
    // Fall-through (should not occur).
    return null;
  }
  
  showInfo(n, shift) {
    // Display documentation for the n-th experiment defined in the model.
    // NOTE: Skip when viewer is showing!
    if(!UI.hidden('experiment-viewer')) return;
    if(n < MODEL.experiments.length) {
      // NOTE: Mouse move over title in viewer passes n = -1.
      const x = (n < 0 ? this.selected_experiment : MODEL.experiments[n]);
      DOCUMENTATION_MANAGER.update(x, shift);
    }
  }
  
  showRunInfo(n, shift) {
    // Display information on the n-th combination if docu-viewer is visible
    // and cursor is moved over run cell while Shift button is held down.
    if(shift && DOCUMENTATION_MANAGER.visible) {
      const info = this.runInfo(n);
      if(info) {
        // Display information as read-only HTML
        DOCUMENTATION_MANAGER.title.innerHTML = info.title;
        DOCUMENTATION_MANAGER.viewer.innerHTML = info.html;
        DOCUMENTATION_MANAGER.edit_btn.classList.remove('enab');
        DOCUMENTATION_MANAGER.edit_btn.classList.add('disab');
      }
    }
  }
  
  updateData() {
    // Fill table cells with their data value or status
    const x = this.selected_experiment;
    if(x) {
      if(x.completed) {
        const ts = msecToTime(x.time_stopped - x.time_started);
        this.viewer_progress.innerHTML =
            `<span class="x-checked" title="${ts}">&#10004;</span>`;
      }
      const rri = x.resultIndex(x.selected_variable);
      if(rri < 0) {
        // @@@ For debugging purposes
        console.log('Variable not found', x.selected_variable);
        return;
      }
      // Get the selected statistic for each run so as to get an array of numbers
      const data = [];
      // Set reference column indices so that values for the reference|
      // configuration can be displayed in orange.
      const ref_conf_indices = [];
      for(const r of x.runs) {
        const rr = r.results[rri];
        if(!rr) {
          data.push(VM.UNDEFINED);
        } else if(x.selected_scale === 'sec') {
          data.push(r.solver_seconds);
        } else if(x.selected_statistic === 'N') {
          data.push(rr.N);
        } else if(x.selected_statistic === 'sum') {
          data.push(rr.sum);
        } else if(x.selected_statistic === 'mean') {
          data.push(rr.mean);
        } else if(x.selected_statistic === 'sd') {
          data.push(Math.sqrt(rr.variance));
        } else if(x.selected_statistic === 'min') {
          data.push(rr.minimum);
        } else if(x.selected_statistic === 'max') {
          data.push(rr.maximum);
        } else if(x.selected_statistic === 'nz') {
          data.push(rr.non_zero_tally);
        } else if(x.selected_statistic === 'except') {
          data.push(rr.exceptions);
        } else if(x.selected_statistic === 'last') {
          data.push(rr.last);
        }
      }
      // Scale data as selected.
      const scaled = data.slice();
      // NOTE: Scale only after the experiment has been completed AND
      // configurations have been defined (otherwise comparison is pointless).
      if(x.completed && this.nr_of_configurations > 0) {
        const n = scaled.length / this.nr_of_configurations;
        if(x.selected_scale === 'dif') {
          // Compute difference: current configuration - reference configuration.
          const rc = x.reference_configuration;
          for(let i = 0; i < this.nr_of_configurations; i++) {
            if(i != rc) {
              for(let j = 0; j < n; j++) {
                scaled[i * n + j] =  scaled[i * n + j] - scaled[rc * n + j];
              }
            }
          }
          // Set difference for reference configuration itself to 0.
          for(let i = 0; i < n; i++) {
            const index = rc * n + i;
            scaled[index] = 0;
            ref_conf_indices.push(index);
          }
        } else if(x.selected_scale === 'reg') {
          // Compute regret: current config - high value config in same scenario.
          for(let i = 0; i < n; i++) {
            // Get high value.
            let high = VM.MINUS_INFINITY;
            for(let j = 0; j < this.nr_of_configurations; j++) {
              high = Math.max(high, scaled[j * n + i]);
            }
            // Scale (so high config always has value 0).
            for(let j = 0; j < this.nr_of_configurations; j++) {
              scaled[j * n + i] -= high;
            }            
          }
        }
      }
      // For color scales, compute normalized scores.
      const
          high = Math.max(...scaled),
          low = Math.min(...scaled),
          // Avoid too small value ranges.
          range = (high - low < VM.NEAR_ZERO ? 0 : high - low),
          normalized = scaled.map((v) => range ? (v - low) / range : v),
          formatted = scaled.map((v) => VM.sig4Dig(v));
      // Format data such that they all have same number of decimals.
      uniformDecimals(formatted);
      // Display formatted data in cells.
      for(let i = 0; i < x.combinations.length; i++) {
        const cell = document.getElementById('xr' + i);
        if(i < x.runs.length) {
          cell.innerHTML = formatted[i];
          cell.classList.remove('not-run');
          cell.style.backgroundColor = this.color_scale.rgb(normalized[i]);
          cell.style.color = (ref_conf_indices.indexOf(i) >= 0 ?
              'orange' : 'black');
          const
              r = x.runs[i],
              rr = r.results[rri],
              rdt = (r.time_recorded - r.time_started) * 0.001,
              rdts = VM.sig2Dig(rdt),
              ss = VM.sig2Dig(r.solver_seconds),
              ssp = (rdt < VM.NEAR_ZERO ? '' :
                  ' (' + Math.round(r.solver_seconds * 100 / rdt) + '%)'),
              w = (r.warning_count > 0 ?
                  ' ' + pluralS(r.warning_count, 'warning') + '. ' : '');
          cell.title = ['Run #', i, ' (', r.time_steps, ' time steps of ',
              r.time_step_duration, ' h) took ', rdts, ' s. Solver used ', ss, ' s',
              ssp, '.', w, (rr ? `
N = ${rr.N}, vector length = ${rr.vector.length}` : '')].join(''); 
          if(r.warning_count > 0) cell.classList.add('warnings');
        }
        if(x.chart_combinations.indexOf(i) < 0) {
          cell.classList.remove('in-chart');
        } else {
          cell.classList.add('in-chart');
        }
      }
    }
  }
  
  setVariable() {
    // Update view for selected variable
    const x = this.selected_experiment;
    if(x) {
      x.selected_variable = this.viewer_variable.value;
      this.updateData();
    }
  }
  
  setStatistic() {
    // Update view for selected variable.
    const x = this.selected_experiment;
    if(x) {
      x.selected_statistic = this.viewer_statistic.value;
      this.updateData();
      // NOTE: Update of Chart Manager is needed only when it is showing
      // run statistics.
      if(CHART_MANAGER.runs_stat) CHART_MANAGER.updateDialog();
    }
  }

  setReference(cfg) {
    // Set reference configuration
    const x = this.selected_experiment;
    if(x) {
      x.reference_configuration = cfg;
      this.drawTable();
    }
  }

  updateSpinner(type, dir) {
    // Increase or decrease spinner value (within constraints)
    const x = this.selected_experiment,
          xdims = x.actual_dimensions.length;
    if(x) {
      if(type === 'c') {
        // NOTE: check for actual change, as then reference config must be reset
        const cd = Math.max(0, Math.min(
          xdims - x.column_scenario_dims, x.configuration_dims + dir));
        if(cd != x.configuration_dims) {
          x.configuration_dims = cd;
          x.reference_configuration = 0;
        }
        document.getElementById('xp-cd-value').innerHTML = x.configuration_dims;
      } else if(type === 's') {
        x.column_scenario_dims = Math.max(0, Math.min(
            xdims - x.configuration_dims, x.column_scenario_dims + dir));
        document.getElementById('xp-sd-value').innerHTML = x.column_scenario_dims;
      }
      // Disable "minus" when already at 0
      if(x.configuration_dims > 0) {
        document.getElementById('xp-cd-minus').classList.remove('no-spin');
      } else {
        document.getElementById('xp-cd-minus').classList.add('no-spin');
      }
      if(x.column_scenario_dims > 0) {
        document.getElementById('xp-sd-minus').classList.remove('no-spin');
      } else {
        document.getElementById('xp-sd-minus').classList.add('no-spin');
      }
      // Ensure that # configurations + # column scenarios <= # dimensions
      const
          spl = this.viewer.getElementsByClassName('spin-plus'),
          rem = (x.configuration_dims + x.column_scenario_dims < xdims);
      for(const sp of spl) {
        if(rem) {
          sp.classList.remove('no-spin');
        } else {
          sp.classList.add('no-spin');
        }
      }
      if(dir != 0 ) this.drawTable();
    }
  }
  
  setScale() {
    // Update view for selected scale
    const x = this.selected_experiment;
    if(x) {
      x.selected_scale = this.viewer_scale.value;
      this.updateData();
      // NOTE: Update of Chart Manager is needed when it is showing
      // run statistics because solver times may be plotted.
      if(CHART_MANAGER.runs_stat) CHART_MANAGER.updateDialog();
    }
  }
  
  clearColorScales() {
    // Remove black rim from all color scale icons.
    const csl = this.viewer.getElementsByClassName('color-scale');
    for(const cs of csl) cs.classList.remove('sel-cs');
  }
  
  setColorScale(cs) {
    // Update view for selected color scale (values: rb, br, rg, gr or no)
    const x = this.selected_experiment;
    if(x) {
      if(cs) {
        this.clearColorScales();
        x.selected_color_scale = cs;
        this.color_scale.set(cs);
        document.getElementById(`xv-${cs}-scale`).classList.add('sel-cs');
      }
      this.updateData();
    }
  }
  
  deleteExperiment() {
    const x = this.selected_experiment;
    if(x) {
      const xi = MODEL.indexOfExperiment(x.title);
      if(xi >= 0) MODEL.experiments.splice(xi, 1);
      this.selected_experiment = null;
      this.updateDialog();
    }
  }
  
  selectParameter(p, shift=false) {
    const dim = p.startsWith('d');
    this.selected_parameter = p;
    this.focal_table = (dim ? this.dimension_table : this.chart_table);
    if(dim && shift) {
      const
          x = this.selected_experiment,
          di = parseInt(p.substring(1)),
          pi = x.plot_dimensions.indexOf(di);
      if(pi < 0) {
        x.plot_dimensions.push(di);
      } else {
        x.plot_dimensions.splice(pi, 1);
      }
      if(CHART_MANAGER.runs_stat) CHART_MANAGER.updateDialog();
    }
    this.updateDialog();
  }
  
  updateUpDownButtons() {
    // Show position and (de)activate up and down buttons as appropriate
    let mvup = false, mvdown = false;
    const x = this.selected_experiment, sp = this.selected_parameter;
    if(x && sp) {
      const type = sp.charAt(0),
            index = parseInt(sp.slice(1));
      if(type == 'd') {
        mvup = index > 0;
        mvdown = index < x.dimensions.length - 1;
      }
    }
    const
        ub = document.getElementById('xp-d-up-btn'),
        db = document.getElementById('xp-d-down-btn');
    if(mvup) {
      ub.classList.remove('v-disab');
    } else {
      ub.classList.add('v-disab');
    }
    if(mvdown) {
      db.classList.remove('v-disab');
    } else {
      db.classList.add('v-disab');
    }
  }
  
  moveDimension(dir) {
    // Move dimension one position up (-1) or down (+1)
    const x = this.selected_experiment, sp = this.selected_parameter;
    if(x && sp) {
      const type = sp.charAt(0),
            index = parseInt(sp.slice(1));
      if(type == 'd') {
        if(dir > 0 && index < x.dimensions.length - 1 ||
            dir < 0 && index > 0) {
          const
              d = x.dimensions.splice(index, 1),
              ndi = index + dir;
          x.dimensions.splice(ndi, 0, d[0]);
          this.selected_parameter = 'd' + ndi;
        }
        this.updateParameters();
      }
    }
  }
  
  editIteratorRanges() {
    // Open dialog for editing iterator ranges.
    const
        x = this.selected_experiment,
        md = this.iterator_modal,
        il = ['i', 'j', 'k'];
    if(x) {
      // NOTE: there are always 3 iterators (i, j k) so these have fixed
      // FROM and TO input fields in the dialog.
      for(let i = 0; i < 3; i++) {
        const k = il[i];
        md.element(k + '-from').value = x.iterator_ranges[i][0];
        md.element(k + '-to').value = x.iterator_ranges[i][1];
      }
      this.iterator_modal.show();
    }
  }

  modifyIteratorRanges() {
    const
        x = this.selected_experiment,
        md = this.iterator_modal;
    if(x) {
      // First validate all input fields (must be integer values).
      // NOTE: Test using a copy so as not to overwrite values until OK.
      const
          il = ['i', 'j', 'k'],
          ir = [[0, 0], [0, 0], [0, 0]],
          re = /^[\+\-]?[0-9]+$/;
      let el, f, t;
      for(let i = 0; i < 3; i++) {
        const k = il[i];
        el = md.element(k + '-from');
        f = el.value.trim() || '0';
        if(f === '' || re.test(f)) {
          el = md.element(k + '-to');
          t = el.value.trim() || '0';
          if(t === '' || re.test(t)) el = null;
        }
        // NULL value signals that field inputs are valid.
        if(el === null) {
          ir[i] = [f, t];
        } else {
          el.focus();
          UI.warn('Iterator range limits must be integers (or default to 0)');
          return;
        }
      }
      // Input validated, so modify the iterator dimensions (if altered).
      let altered = false;
      for(let r = 0; r < 3; r++) {
        const
            or = x.iterator_ranges[r],
            nr= ir[r];
        altered = or[0] !== nr[0] || or[1] !== nr[1]; 
      }
      if(altered) {
        x.iterator_ranges = ir;
        x.updateIteratorDimensions();
        this.updateParameters();
      }
    }
    md.hide();
  }
 
  editSettingsDimensions() {
    // Open dialog for editing model settings dimensions.
    const x = this.selected_experiment, rows = [];
    if(x) {
      // Initialize selector list.
      for(let i = 0; i < x.settings_selectors.length; i++) {
        const sel = x.settings_selectors[i].split('|');
        rows.push('<tr onclick="EXPERIMENT_MANAGER.editSettingsSelector(', i,
            ');"><td width="25%">', sel[0], '</td><td>', sel[1], '</td></tr>');
      }
      this.settings_modal.element('s-table').innerHTML = rows.join('');
      // Initialize combination list.
      rows.length = 0;
      for(let i = 0; i < x.settings_dimensions.length; i++) {
        const dim = x.settings_dimensions[i];
        rows.push('<tr onclick="EXPERIMENT_MANAGER.editSettingsDimension(', i,
            ');"><td>', setString(dim), '</td></tr>');
      }
      this.settings_modal.element('d-table').innerHTML = rows.join('');
      this.settings_modal.show();
      // NOTE: Clear infoline because dialog can generate warnings that would
      // otherwise remain visible while no longer relevant.
      UI.setMessage('');
    }
  }

  closeSettingsDimensions() {
    // Hide editor, and then update the experiment manager to reflect changes.
    this.settings_modal.hide();
    this.updateDialog();
  }
  
  editSettingsSelector(selnr) {
    const x = this.selected_experiment;
    if(!x) return;
    let action = 'Add',
        clear = '',
        sel = ['', ''];
    this.edited_selector_index = selnr;
    if(selnr >= 0) {
      action = 'Edit';
      clear = '(clear to remove)';
      sel = x.settings_selectors[selnr].split('|');
    }
    const md = this.settings_selector_modal;
    md.element('action').innerHTML = action;
    md.element('clear').innerHTML = clear;
    md.element('code').value = sel[0];
    md.element('string').value = sel[1];
    md.show(sel[0] ? 'string' : 'code');
  }
  
  modifySettingsSelector() {
    // Accepts valid selectors and settings, tolerating a decimal comma
    let x = this.selected_experiment;
    if(x) {
      const
          md = this.settings_selector_modal,
          sc = md.element('code'),
          ss = md.element('string'),
          // NOTE: Simply remove invalid characters from selector, but accept
          // '=' here to permit associating settings with iterator selectors. 
          code = sc.value.replace(/[^\w\+\-\%\=]/g, ''),
          value = ss.value.trim().toLowerCase().replace(',', '.'),
          add =  this.edited_selector_index < 0;
      // Remove selector if either field has been cleared
      if(code.length === 0 || value.length === 0) {
        if(!add) {
          x.settings_selectors.splice(this.edited_selector_index, 1);
        }
      } else {
        // Check for uniqueness of code.
        for(let i = 0; i < x.settings_selectors.length; i++) {
          // NOTE: ignore selector being edited, as this selector can be renamed
          if(i != this.edited_selector_index &&
              x.settings_selectors[i].split('|')[0] === code) {
            UI.warn(`Settings selector "${code}"already defined`);
            sc.focus();
            return;
          }
        }
        // Check for valid syntax -- canonical example: s=0.25h t=1-100 b=12 l=6
        const re = /^(s\=\d+(\.?\d+)?(yr?|wk?|d|h|m|min|s)\s+)?(t\=\d+(\-\d+)?\s+)?(b\=\d+\s+)?(l=\d+\s+)?(\-[ckl]+\s+)?$/i;
        if(!re.test(value + ' ')) {
          UI.warn(`Invalid settings "${value}"`);
          ss.focus();
          return;
        }
        // Parse settings with testing = TRUE to avoid start time > end time,
        // or block length = 0, as regex test does not prevent this
        if(!MODEL.parseSettings(value, true)) {
          ss.focus();
          return;
        }
        // Selector has format code|settings 
        const sel = code + '|' + value;
        if(add) {
          x.settings_selectors.push(sel);
        } else {
          // NOTE: rename occurrence of code in dimension (should at most be 1)
          const oc = x.settings_selectors[this.edited_selector_index].split('|')[0];
          x.settings_selectors[this.edited_selector_index] = sel;
          x.renameSelectorInDimensions(oc, code);
        }
      }
      md.hide();
    }
    // Update settings dimensions dialog
    this.editSettingsDimensions();
  }

  editSettingsDimension(dimnr) {
    const x = this.selected_experiment;
    if(!x) return;
    let action = 'Add',
        clear = '',
        value = '';
    this.edited_dimension_index = dimnr;
    if(dimnr >= 0) {
      action = 'Edit';
      clear = '(clear to remove)';
      // NOTE: present to modeler as space-separated string
      value = x.settings_dimensions[dimnr].join(' ');
    }
    const md = this.settings_dimension_modal;
    md.element('action').innerHTML = action;
    md.element('clear').innerHTML = clear;
    md.element('string').value = value;
    md.show('string');
  }
  
  modifySettingsDimension() {
    let x = this.selected_experiment;
    if(x) {
      const
          add = this.edited_dimension_index < 0,
          // Trim whitespace and reduce inner spacing to a single space
          dimstr = this.settings_dimension_modal.element('string').value.trim();
      // Remove dimension if field has been cleared
      if(dimstr.length === 0) {
        if(!add) {
          x.settings_dimensions.splice(this.edited_dimension_index, 1);
        }
      } else {
        // Check for valid selector list
        const
            dim = dimstr.split(/\s+/g),
            ssl = [];
        // Get this experiment's settings selector list
        for(let i = 0; i < x.settings_selectors.length; i++) {
          ssl.push(x.settings_selectors[i].split('|')[0]);
        }
        // All selectors in string should have been defined
        let c = complement(dim, ssl);
        if(c.length > 0) {
          UI.warn('Settings dimension contains ' +
              pluralS(c.length, 'unknown selector') + ': ' + c.join(' '));
          return;
        }
        // No selectors in string may occur in another dimension
        for(let i = 0; i < x.settings_dimensions.length; i++) {
          c = intersection(dim, x.settings_dimensions[i]);
          if(c.length > 0 && i != this.edited_dimension_index) {
            UI.warn(pluralS(c.length, 'selector') + ' already in use: ' +
                c.join(' '));
            return;
          }
        }
        // OK? Then add or modify
        if(add) {
          x.settings_dimensions.push(dim);
        } else {
          x.settings_dimensions[this.edited_dimension_index] = dim;
        }
      }
    }
    this.settings_dimension_modal.hide();
    // Update settings dimensions dialog
    this.editSettingsDimensions();
  }
 
  editCombinationDimensions() {
    // Open dialog for editing combination dimensions
    const
        x = this.selected_experiment,
        rows = [];
    if(x) {
      // Initialize selector list
      for(let i = 0; i < x.combination_selectors.length; i++) {
        const sel = x.combination_selectors[i].split('|');
        rows.push('<tr onclick="EXPERIMENT_MANAGER.editCombinationSelector(', i,
            ');"><td width="25%">', sel[0], '</td><td>', sel[1], '</td></tr>');
      }
      this.combination_modal.element('s-table').innerHTML = rows.join('');
      // Initialize combination list
      rows.length = 0;
      for(let i = 0; i < x.combination_dimensions.length; i++) {
        const dim = x.combination_dimensions[i];
        rows.push('<tr onclick="EXPERIMENT_MANAGER.editCombinationDimension(', i,
            ');"><td>', setString(dim), '</td></tr>');
      }
      this.combination_modal.element('d-table').innerHTML = rows.join('');
      this.combination_modal.show();
      // NOTE: clear infoline because dialog can generate warnings that would
      // otherwise remain visible while no longer relevant
      UI.setMessage('');
    }
  }

  closeCombinationDimensions() {
    // Hide editor, and then update the experiment manager to reflect changes
    this.combination_modal.hide();
    this.updateDialog();
  }
  
  editCombinationSelector(selnr) {
    const x = this.selected_experiment;
    if(!x) return;
    let action = 'Add',
        clear = '',
        sel = ['', ''];
    this.edited_combi_selector_index = selnr;
    if(selnr >= 0) {
      action = 'Edit';
      clear = '(clear to remove)';
      sel = x.combination_selectors[selnr].split('|');
    }
    const md = this.combination_selector_modal;
    md.element('action').innerHTML = action;
    md.element('clear').innerHTML = clear;
    md.element('code').value = sel[0];
    md.element('string').value = sel[1];
    md.show(sel[0] ? 'string' : 'code');
  }
  
  modifyCombinationSelector() {
    // Accepts an "orthogonal" set of selectors
    let x = this.selected_experiment;
    if(x) {
      const
          md = this.combination_selector_modal,
          sc = md.element('code'),
          ss = md.element('string'),
          // Ignore invalid characters in the combination selector
          code = sc.value.replace(/[^\w\+\-\%]/g, ''),
          // Reduce comma's, semicolons and multiple spaces in the
          // combination string to a single space
          value = ss.value.trim().replace(/[\,\;\s]+/g, ' '),
          add =  this.edited_combi_selector_index < 0;
      // Remove selector if either field has been cleared
      if(code.length === 0 || value.length === 0) {
        if(!add) {
          x.combination_selectors.splice(this.edited_combi_selector_index, 1);
        }
      } else {
        let ok = x.allDimensionSelectors.indexOf(code) < 0;
        if(ok) {
          // Check for uniqueness of code
          for(let i = 0; i < x.combination_selectors.length; i++) {
            // NOTE: ignore selector being edited, as this selector can be renamed
            if(i != this.edited_combi_selector_index &&
                x.combination_selectors[i].startsWith(code + '|')) ok = false;
          }
        }
        if(!ok) {
          UI.warn(`Combination selector "${code}" already defined`);
          sc.focus();
          return;
        }
        // Test for orthogonality (and existence!) of the selectors
        if(!x.orthogonalSelectors(value.split(' '))) {
          ss.focus();
          return;
        }
        // Combination selector has format code|space-separated selectors 
        const sel = code + '|' + value;
        if(add) {
          x.combination_selectors.push(sel);
        } else {
          // NOTE: rename occurrence of code in dimension (should at most be 1)
          const oc = x.combination_selectors[this.edited_combi_selector_index].split('|')[0];
          x.combination_selectors[this.edited_combi_selector_index] = sel;
          for(let i = 0; i < x.combination_dimensions.length; i++) {
            const si = x.combination_dimensions[i].indexOf(oc);
            if(si >= 0) x.combination_dimensions[i][si] = code;
          }
        }
      }
      md.hide();
    }
    // Update combination dimensions dialog
    this.editCombinationDimensions();
  }

  editCombinationDimension(dimnr) {
    const x = this.selected_experiment;
    if(!x) return;
    let action = 'Add',
        clear = '',
        value = '';
    this.edited_combi_dimension_index = dimnr;
    if(dimnr >= 0) {
      action = 'Edit';
      clear = '(clear to remove)';
      // NOTE: present to modeler as space-separated string
      value = x.combination_dimensions[dimnr].join(' ');
    }
    const md = this.combination_dimension_modal;
    md.element('action').innerHTML = action;
    md.element('clear').innerHTML = clear;
    md.element('string').value = value;
    md.show('string');
  }
  
  modifyCombinationDimension() {
    let x = this.selected_experiment;
    if(x) {
      const
          add = this.edited_combi_dimension_index < 0,
          // Trim whitespace and reduce inner spacing to a single space.
          dimstr = this.combination_dimension_modal.element('string').value.trim();
      // Remove dimension if field has been cleared.
      if(dimstr.length === 0) {
        if(!add) {
          x.combination_dimensions.splice(this.edited_combi_dimension_index, 1);
        }
      } else {
        // Check for valid selector list.
        const
            dim = dimstr.split(/\s+/g),
            ssl = [];
        // Get this experiment's combination selector list.
        for(const sel of x.combination_selectors) ssl.push(sel.split('|')[0]);
        // All selectors in string should have been defined.
        let c = complement(dim, ssl);
        if(c.length > 0) {
          UI.warn('Combination dimension contains ' +
              pluralS(c.length, 'unknown selector') + ': ' + c.join(' '));
          return;
        }
        // All selectors should expand to non-overlapping selector sets.
        if(!x.orthogonalCombinationDimensions(dim)) return;
        // Do not add when a (setwise) identical combination dimension exists.
        for(const cd of x.combination_dimensions) {
          if(intersection(dim, cd).length === dim.length) {
            UI.notify('Combination already defined: ' + setString(cd));
            return;
          }
        }
        // OK? Then add or modify.
        if(add) {
          x.combination_dimensions.push(dim);
        } else {
          x.combination_dimensions[this.edited_combi_dimension_index] = dim;
        }
      }
    }
    this.combination_dimension_modal.hide();
    // Update combination dimensions dialog.
    this.editCombinationDimensions();
  }
 
  editActorDimension() {
    // Open dialog for editing the actor dimension.
    const x = this.selected_experiment, rows = [];
    if(x) {
      // Initialize selector list.
      for(let i = 0; i < x.actor_selectors.length; i++) {
        rows.push('<tr onclick="EXPERIMENT_MANAGER.editActorSelector(', i,
            ');"><td>', x.actor_selectors[i].selector,
            '</td><td style="font-family: monospace">',
            x.actor_selectors[i].round_sequence, '</td></tr>');
      }
      this.actor_dimension_modal.element('table').innerHTML = rows.join('');
      this.actor_dimension_modal.show();
      // NOTE: Clear infoline because dialog can generate warnings that would
      // otherwise remain visible while no longer relevant.
      UI.setMessage('');
    }
  }

  closeActorDimension() {
    // Hide editor, and then update the experiment manager to reflect changes
    this.actor_dimension_modal.hide();
    this.updateDialog();
  }
  
  editActorSelector(selnr) {
    let x = this.selected_experiment;
    if(!x) return;
    let action = 'Add',
        clear = '', asel;
    this.edited_selector_index = selnr;
    if(selnr >= 0) {
      action = 'Edit';
      clear = '(clear to remove)';
      asel = x.actor_selectors[selnr];
    } else {
      asel = new ActorSelector();
    }
    const md = this.actor_selector_modal;
    md.element('action').innerHTML = action;
    md.element('code').value = asel.selector;
    md.element('rounds').value = asel.round_sequence;
    md.element('clear').innerHTML = clear;
    md.show('code');
  }
  
  modifyActorSelector() {
    let x = this.selected_experiment;
    if(x) {
      const
          easc = this.actor_selector_modal.element('code'),
          code = easc.value.replace(/[^\w\+\-\%]/g, ''),
          add =  this.edited_selector_index < 0;
      // Remove selector if code has been cleared
      if(code.length === 0) {
        if(!add) {
          x.actor_selectors.splice(this.edited_selector_index, 1);
        }
      } else {
        // Check for uniqueness of code
        for(let i = 0; i < x.actor_selectors.length; i++) {
          // NOTE: ignore selector being edited, as this selector can be renamed
          if(i != this.edited_selector_index &&
              x.actor_selectors[i].selector == code) {
            UI.warn(`Actor selector "${code}"already defined`);
            easc.focus();
            return;
          }
        }
        const
            rs = this.actor_selector_modal.element('rounds'),
            rss = rs.value.replace(/[^a-zA-E]/g, ''),
            rsa = ACTOR_MANAGER.checkRoundSequence(rss);
        if(!rsa) {
          // NOTE: warning is already displayed by parser
          rs.focus();
          return;
        }
        const
            asel = (add ? new ActorSelector() :
            x.actor_selectors[this.edited_selector_index]);
        asel.selector = code;
        asel.round_sequence = rsa;
        rs.value = rss;
        if(add) x.actor_selectors.push(asel);
      }
    }
    this.actor_selector_modal.hide();
    // Update actor dimensions dialog
    this.editActorDimension();
  }
  
  showClustersToIgnore() {
    // Opens the "clusters to ignore" dialog
    const x = this.selected_experiment;
    if(!x) return;
    const
        md = this.clusters_modal,
        clist = [],
        csel = md.element('select'),
        sinp = md.element('selectors');
    // NOTE: Copy experiment property to modal dialog property, so that changes
    // are made only when OK is clicked
    md.clusters = [];
    for(const cs of x.clusters_to_ignore) {
      md.clusters.push({cluster: cs.cluster, selectors: cs.selectors});
    }
    md.cluster_index = -1;
    for(let k in MODEL.clusters) if(MODEL.clusters.hasOwnProperty(k)) {
      const c = MODEL.clusters[k];
      // Do not add top cluster, nor clusters already on the list.
      if(c !== MODEL.top_cluster && !c.ignore && !x.mayBeIgnored(c)) {
        clist.push(`<option value="${k}">${c.displayName}</option>`);
      }
    }
    csel.innerHTML = clist.join('');
    sinp.style.backgroundColor = 'inherit';
    this.updateClusterList();
    md.show();
  }
  
  updateClusterList() {
    const
        md = this.clusters_modal,
        clst = md.element('list'),
        nlst = md.element('no-list'),
        ctbl = md.element('table'),
        sinp = md.element('selectors'),
        sdiv = md.element('selectors-div'),
        cl = md.clusters.length;
    if(cl > 0) {
      // Show cluster+selectors list.
      const ol = [];
      for(let i = 0; i < cl; i++) {
        const cti = md.clusters[i];
        ol.push('<tr class="variable',
          (i === md.cluster_index ? ' sel-set' : ''),
          '" onclick="EXPERIMENT_MANAGER.selectCluster(', i, ');"><td>',
          cti.cluster.displayName, '</td><td>', cti.selectors, '</td></tr>');
      }
      ctbl.innerHTML = ol.join('');
      clst.style.display = 'block';
      nlst.style.display = 'none';
    } else {
      // Hide list and show "no clusters set to be ignored".
      clst.style.display = 'none';
      nlst.style.display = 'block';
    }
    if(md.cluster_index < 0) {
      // Hide selectors and delete button
      sdiv.style.display = 'none';
    } else {
      // Show selectors and enable input and delete button
      sinp.value = md.clusters[md.cluster_index].selectors;
      sdiv.style.display = 'block';
    }
    sinp.style.backgroundColor = 'inherit';
  }

  selectCluster(n) {
    // Set selected cluster index to `n`.
    this.clusters_modal.cluster_index = n;
    this.updateClusterList();
  }

  addClusterToIgnoreList() {
    const
      md = this.clusters_modal,
      sel = md.element('select'),
      c = MODEL.objectByID(sel.value);
    if(c) {
      md.clusters.push({cluster: c, selectors: ''});
      md.cluster_index = md.clusters.length - 1;
      // Remove cluster from select so it cannot be added again.
      sel.remove(sel.selectedIndex);
      this.updateClusterList();
    }
  }
  
  editIgnoreSelectors() {
    this.clusters_modal.element('selectors').style.backgroundColor = 'white';
  }
  
  setIgnoreSelectors() {
    const
        md = this.clusters_modal,
        sinp = md.element('selectors'),
        s = sinp.value.replace(/[\;\,]/g, ' ').trim().replace(
          /[^a-zA-Z0-9\+\-\%\_\s]/g, '').split(/\s+/).join(' ');
    if(md.cluster_index >= 0) {
      md.clusters[md.cluster_index].selectors = s;
    }
    this.updateClusterList();
  }
  
  deleteClusterFromIgnoreList() {
    // Delete selected cluster+selectors from list.
    const md = this.clusters_modal;
    if(md.cluster_index >= 0) {
      md.clusters.splice(md.cluster_index, 1);
      md.cluster_index = -1;
      this.updateClusterList();
    }
  }
  
  modifyClustersToIgnore() {
    // Replace current list by cluster+selectors list of modal dialog.
    const
        md = this.clusters_modal,
        x = this.selected_experiment;
    if(x) x.clusters_to_ignore = md.clusters;
    md.hide();
    this.updateDialog();
  }

  promptForParameter(type) {
    // Open dialog for adding new dimension or chart.
    const x = this.selected_experiment;
    if(x) {
      const ol = [];
      this.parameter_modal.element('type').innerHTML = type;
      if(type === 'dimension') {
        x.inferAvailableDimensions();
        for(let i = 0; i < x.available_dimensions.length; i++) {
          const ds = setString(x.available_dimensions[i]);
          ol.push(`<option value="${i}">${ds}</option>`);
        }
      } else { 
        for(const c of this.suitable_charts) {
          // NOTE: Exclude charts already in the selected experiment.
          if (x.charts.indexOf(c) < 0) {
            ol.push(`<option value="${c.title}">${c.title}</option>`);
          }
        }
      }
      this.parameter_modal.element('select').innerHTML = ol.join('');
      this.parameter_modal.show('select');
    }    
  }
  
  addParameter() {
    // Add parameter (dimension or chart) to experiment.
    const
        x = this.selected_experiment,
        name = this.parameter_modal.element('select').value;
    if(x && name) {
      if(this.parameter_modal.element('type').innerHTML === 'chart') {
        const ci = MODEL.indexOfChart(name);
        if(ci >= 0 && x.charts.indexOf(MODEL.charts[ci]) < 0) {
          x.charts.push(MODEL.charts[ci]);
        }
      } else {
        // List of available dimensions should still be unchanged,
        // so look up the dimension by the indexed passed as `name`.
        let d = x.available_dimensions[parseInt(name)];
        if(d) x.dimensions.push(d.slice());
      }
      this.updateParameters();
      this.parameter_modal.hide();
    }
  }
  
  deleteParameter() {
    // Remove selected dimension or chart from selected experiment.
    const
        x = this.selected_experiment,
        sp = this.selected_parameter;
    if(x && sp) {
      const type = sp.charAt(0), index = sp.slice(1);
      if(type === 'd') {
        x.dimensions.splice(index, 1);
      } else {
        x.charts.splice(index, 1);
      }
      this.selected_parameter = '';
      this.updateParameters();
    }
  }

  editExclusions() {
    // Give visual feedback by setting background color to white.
    this.exclude.style.backgroundColor = 'white';
  }
  
  setExclusions() {
    // Sanitize string before accepting it as space-separated selector list.
    const
        x = this.selected_experiment;
    if(x) {
      x.excluded_selectors = this.exclude.value.replace(
          /[\;\,]/g, ' ').trim().replace(
          /[^a-zA-Z0-9\+\-\=\%\_\s]/g, '').split(/\s+/).join(' ');
      this.exclude.value = x.excluded_selectors;
      this.updateParameters();
    }
    this.exclude.style.backgroundColor = 'inherit';
  }
  
  readyButtons() {
    // Set experiment run control buttons in "ready" state.
    this.pause_btn.classList.remove('blink');
    this.pause_btn.classList.add('off');
    this.stop_btn.classList.add('off');
    this.start_btn.classList.remove('off', 'blink');
  }
  
  pausedButtons(aci) {
    // Set experiment run control buttons in "paused" state.
    this.pause_btn.classList.remove('blink');
    this.pause_btn.classList.add('off');
    this.start_btn.classList.remove('off');
    // Blinking start button indicates: paused -- click to resume.
    this.start_btn.classList.add('blink');
    this.viewer_progress.innerHTML = `Run ${aci} PAUSED`;
  }
  
  resumeButtons() {
    // Changes buttons to "running" state, and return TRUE if state was "paused".
    const paused = this.start_btn.classList.contains('blink');
    this.start_btn.classList.remove('blink');
    this.start_btn.classList.add('off');
    this.pause_btn.classList.remove('off');
    this.stop_btn.classList.add('off');
    return paused;
  }
  
  pauseExperiment() {
    // Interrupt solver but retain data on server and allow resume.
    UI.notify('Run sequence will be suspended after the current run');
    this.pause_btn.classList.add('blink');
    this.stop_btn.classList.remove('off');
    this.must_pause = true;
  }
  
  stopExperiment() {
    // Interrupt solver but retain data on server (and no resume).
    VM.halt();
    MODEL.running_experiment = null;
    UI.notify('Experiment has been stopped');
    this.viewer_progress.innerHTML = '';
    this.readyButtons();
    this.must_pause = false;
  }
  
  showProgress(ci, p, n) {
    // Show progress in the viewer.
    this.viewer_progress.innerHTML = `Run ${ci} (${p}% of ${n})`;
  }
  
  copyTableToClipboard() {
    UI.copyHtmlToClipboard(
        document.getElementById('viewer-scroll-area').innerHTML);
    UI.notify('Table copied to clipboard (as HTML)');
  }
  
  promptForDownload() {
    // Show the download modal.
    const x = this.selected_experiment;
    if(!x) return;
    const
        md = this.download_modal,
        ds = x.download_settings,
        runs = x.runs.length,
        sruns = x.chart_combinations.length;
    if(!runs) {
      UI.notify('No experiment results');
      return;
    }
    md.element(ds.variables + '-v').checked = true;
    // Disable "selected runs" button when no runs have been selected.
    if(sruns) {
      md.element('selected-r').disabled = false;
      md.element(ds.runs + '-r').checked = true;
    } else {
      md.element('selected-r').disabled = true;
      // Check "all runs" but do not change download setting.
      md.element('all-r').checked = true;
    }
    this.download_modal.show();
    md.element('statistics').checked = ds.statistics;
    md.element('series').checked = ds.series;
    md.element('solver').checked = ds.solver;
    md.element('separator').value = ds.separator;
    md.element('quotes').value = ds.quotes;
    md.element('precision').value = ds.precision;
    md.element('var-count').innerText = x.runs[0].results.length;
    md.element('run-count').innerText = runs;
    md.element('run-s').innerText = (sruns === 1 ? '' : 's');
  }
  
  downloadDataAsCSV() {
    // Push results to browser.
    if(this.selected_experiment) {
      const md = this.download_modal;
      this.selected_experiment.download_settings = {
          variables: md.element('all-v').checked ? 'all' : 'selected',
          runs: md.element('all-r').checked ? 'all' : 'selected',
          statistics: md.element('statistics').checked,
          series: md.element('series').checked,
          solver: md.element('solver').checked,
          separator: md.element('separator').value,
          quotes: md.element('quotes').value,
          precision: safeStrToInt(md.element('precision').value, 8)
      };
      md.hide();
      const data = this.selected_experiment.resultsAsCSV;
      if(data) {
        UI.setMessage('CSV file size: ' + UI.sizeInBytes(data.length));
        const el = document.getElementById('xml-saver');
        el.href = 'data:attachment/text,' + encodeURI(data);
        console.log('Encoded CSV file size:', el.href.length);
        el.download = 'results.csv';
        if(el.href.length > 25*1024*1024 &&
            navigator.userAgent.search('Chrome') <= 0) {
          UI.notify('CSV file size exceeds 25 MB. ' +
              'If it does not download, select fewer runs');
        }
        el.click();
        UI.normalCursor();
      } else {
        UI.notify('No data');
      }
    }
  }
  
} // END of class GUIExperimentManager

