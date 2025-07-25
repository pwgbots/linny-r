/*
Linny-R is an executable graphical specification language for (mixed integer)
linear programming (MILP) problems, especially unit commitment problems (UCP).
The Linny-R language and tool have been developed by Pieter Bots at Delft
University of Technology, starting in 2009. The project to develop a browser-
based version started in 2017. See https://linny-r.org for more information.

This JavaScript file (linny-r-classes.js) defines the object classes used in
the Linny-R project.
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

// CLASS LinnyRModel
class LinnyRModel {
  constructor(name, author) {
    this.name = name;
    this.author = author;
    this.comments = '';
    this.reset();
    this.xml_header = '<?xml version="1.0" encoding="ISO-8859-1"?>';
    this.chart_id_prefix = '__CHART__';
  }

  reset() {
    // Resets model properties to their default values
    const d = new Date();
    this.time_created = d;
    this.last_modified = d;
    this.version = LINNY_R_VERSION;
    this.encrypt = false;
    this.time_scale = 1;
    this.time_unit = CONFIGURATION.default_time_unit;
    this.currency_unit = CONFIGURATION.default_currency_unit;
    this.default_unit = CONFIGURATION.default_scale_unit;
    this.decimal_comma = CONFIGURATION.decimal_comma;
    // NOTE: Default scale unit list comprises only the primitive base unit
    this.scale_units = {'1': new ScaleUnit('1', '1', '1')};
    this.power_grids = {};
    this.actors = {};
    this.products = {};
    this.processes = {};
    this.clusters = {};
    this.links = {};
    this.constraints = {};
    this.datasets = {};
    this.loading_datasets = [];
    this.max_time_to_load = 0;
    this.imports = [];
    this.exports = [];
    this.charts = [];
    this.experiments = [];
    this.dimensions = [];
    this.selector_order_string = '';
    this.selector_order_list = [];
    this.next_process_number = 0;
    this.next_product_number = 0;
    this.focal_cluster = null;
    this.top_cluster = this.addCluster(UI.TOP_CLUSTER_NAME, UI.NO_ACTOR);
    this.focal_cluster = this.top_cluster;
    this.equations_dataset = this.addDataset(UI.EQUATIONS_DATASET_NAME);
    this.ignored_entities = {};
    this.black_box = false;
    this.black_box_entities = {};
    
    // Actor related properties
    this.actor_list = [];
    this.rounds = 1;
    this.round_sequence = 'a';
    // NOTE: selected round is used only for the actors dialog (not for runs)
    this.selected_round = 0;
    
    // Model settings
    this.block_length = 1;
    this.start_period = 1; // defines starting point in datasets
    this.end_period = 1;
    this.look_ahead = 0;
    this.grid_pixels = 20;
    this.align_to_grid = true;
    this.with_power_flow = false;
    this.ignore_grid_capacity = false;
    this.ignore_KVL = false;
    this.ignore_power_losses = false;
    this.infer_cost_prices = false;
    this.ignore_negative_flows = false;
    this.report_results = false;
    this.show_block_arrows = true;
    this.last_zoom_factor = 1;
    
    // Default solver settings
    this.timeout_period = 30; // max. solver time in seconds
    this.preferred_solver = ''; // empty string denotes "use default"
    this.integer_tolerance = 5e-7; // integer feasibility tolerance
    this.MIP_gap = 1e-4; // relative MIP gap
    this.always_diagnose = true;
    this.show_notices = true;

    // Sensitivity-related properties
    this.base_case_selectors = '';
    this.sensitivity_parameters = [];
    this.sensitivity_outcomes = [];
    this.active_sensitivity_parameter = null;
    // NOTE: the "active" expression will multiply its result by 1 + delta %
    this.sensitivity_delta = 20;
    this.sensitivity_runs = [];

    // Experiment related properties
    this.inferDimensions();
    this.running_experiment = null;
    
    // Diagram editor related properties
    // t is the time step shown (t = 1 corresponds to start_period)
    this.t = 1; 
    this.selection = [];
    this.selection_related_arrows = [];
    // Set the indicator that the model has not been solved yet
    this.set_up = false;
    this.solved = false;
    // Reset counts of effects of a rename operation
    this.variable_count = 0;
    this.expression_count = 0;
    // Translation time is used to calibrate speed when dragging a node
    // beyond left or upper paper limit.
    this.translation_time = 0;
  }
  
  // NOTE: a model can also be the entity for the documentation manager,
  // and hence should have the methods `type` and `displayName`
  get type() {
    return 'Model';
  }

  get displayName() {
    return (this.name || '(no name)') +
        ' (' + (this.author || 'unknown author') + ')';
  }

  /* METHODS THAT LOOKUP ENTITIES, OR INFER PROPERTIES */
  
  aligned(x) {
    // Return x "rounded" to the alignment grid resolution if alignment
    // option has been checked.
    if(!this.align_to_grid) return x;
    const gr = this.grid_pixels;
    return Math.round(x / gr) * gr;
  }

  get simulationTimeStep() {
    // Return actual model time step, rather than `t`, which is relative
    // to the start of the simulation period.
    return this.t + this.start_period - 1;
  }
  
  get timeStepDuration() {
    // Return duration of 1 time step in hours.
    return this.time_scale * VM.time_unit_values[this.time_unit];
  }
  
  get outcomes() {
    // Return the list of outcome datasets.
    const olist = [];
    for(let k in this.datasets) if(this.datasets.hasOwnProperty(k)) {
      if(this.datasets[k].outcome) olist.push(this.datasets[k]);
    }
    return olist;
  }

  get outcomeNames() {
    // Return the list of names of experiment outcome variables, i.e.,
    // datasets that have been designated as outcomes, and all regular
    // equations (not methods).
    const olist = [];
    for(let k in this.datasets) if(this.datasets.hasOwnProperty(k)) {
      const ds = this.datasets[k];
      if(ds !== this.equations_dataset && ds.outcome) {
        // NOTE: Experiments store only ONE modifier result per run.
        olist.push(ds.displayName);
      }
    }
    // Also add all outcome equation selectors.
    const dsm = this.equations_dataset.modifiers;
    // Exclude selectors starting with a colon (methods) -- just in case.
    for(let k in dsm) if(dsm.hasOwnProperty(k) && !k.startsWith(':')) {
      if(dsm[k].outcome_equation) olist.push(dsm[k].selector);
    }
    return olist;
  }
  
  get newProcessCode() {
    // Return the next unused process code.
    const n = this.next_process_number;
    this.next_process_number++;
    // Process codes are decimal number STRINGS
    // NOTE: processes are numbered zero-based, but displayed as 1, 2, etc.
    return '' + (n + 1);
  }
  
  get newProductCode() {
    // Return the next unused product code
    const n = this.next_product_number;
    this.next_product_number++;
    // Product codes have format #lll where lll is a base-26 number with
    // A = 0, B = 1, ..., Z = 25, AA = 26, AB = 27, etc.
    return letterCode(n);
  }
  
  get settingsString() {
    // Return model settings as string
    const tu = {year: 'y', week: 'w', day: 'd',
        hour: 'h', minute: 'm', second: 's'},
        ss = [
            's=', this.time_scale, tu[this.time_unit],
            ' t=', this.start_period, '-', this.end_period,
            ' b=', this.block_length,
            ' l=', this.look_ahead].join('');
    let go = '';
    if(this.with_power_flow) {
      if(this.ignore_grid_capacity) go += 'c';
      if(this.ignore_KVL) go += 'k';
      if(this.ignore_power_losses) go += 'l';
      if(go) go = ' -' + go;
    }
    return ss + go;
  }
  
  parseSettings(ss, testing=false) {
    // Parse model settings as defined by string `ss`
    const
        sl = ss.toLowerCase().split(/\s+/g),
        tu = {y: 'year', w: 'week', d: 'day',
            h: 'hour', m: 'minute', s: 'second'};
    let ok = true,
        // Initialize values as FALSE to "know" whether they are being set
        sts = false,
        stu = false,
        ssp = false,
        sep = false,
        sbl = false,
        sla = false,
        cap = false,
        kvl = false,
        pls = false;
    for(const kvp of sl) {
      const
          s = kvp.split('='),
          setting = s[0],
          value = s[1];
      if(setting === 's') {
        let fs = value,
            j = fs.length - 1;
        while('yrwkdhmins'.indexOf(fs.charAt(j)) >= 0) {
          j--;
        }
        stu = tu[fs.charAt(j + 1)];
        if(!stu) {
          UI.warn(`Invalid time unit in settings "${ss}"`);
          ok = false;
        }
        sts = parseFloat(fs);
        if(isNaN(sts) || sts <= 0) {
          UI.warn(`Invalid time scale in settings "${ss}"`);
          ok = false;
        }
      } else if(setting === 't') {
        const ts = value.split('-');
        ssp = parseInt(ts[0]);
        if(ts.length > 1) {
          sep = parseInt(ts[1]);
        }
        if(ssp <= 0 || ssp > sep) {
          UI.warn(`Invalid simulation period in settings "${ss}"`);
          ok = false;
        }
      } else if(setting === 'b') {
        sbl = parseInt(value);
        if(sbl <= 0) {
          UI.warn(`Invalid block length in settings "${ss}"`);
          ok = false;
        }
      } else if(setting === 'l') {
        sla = parseInt(value);
      } else if(!value && setting.startsWith('-')) {
        cap = setting.indexOf('c') >= 0;
        kvl = setting.indexOf('k') >= 0;
        pls = setting.indexOf('l') >= 0;
      }
    }
    if(ok && !testing) {
      if(sts !== false) this.time_scale = sts;
      if(stu !== false) this.time_unit = stu;
      if(ssp !== false) this.start_period = ssp;
      if(sep !== false) this.end_period = sep;
      if(sbl !== false) this.block_length = sbl;
      if(sla !== false) this.look_ahead = sla;
      if(this.with_power_flow) {
        this.ignore_grid_capacity = cap;
        this.ignore_KVL = kvl;
        this.ignore_power_losses = pls;
      }
    }
    return ok;
  }
  
  powerGridByID(id) {
    // Return power grid identified by hex string `id`.
    if(this.power_grids.hasOwnProperty(id)) return this.power_grids[id];
    return null;
  }
  
  powerGridByName(n) {
    // Return power grid identified by name `n`.
    for(let k in this.power_grids) if(this.power_grids.hasOwnProperty(k)) {
      const pg = this.power_grids[k];
      if(ciCompare(pg.name, n) === 0) return pg;
    }
    return null;
  }
  
  get powerGridsWithKVL() {
    // Return list of power grids for which Kirchhoff's voltage law must
    // be enforced.
    const pgl = [];
    if(!this.ignore_KVL) {
      for(let k in this.power_grids) if(this.power_grids.hasOwnProperty(k)) {
        const pg = this.power_grids[k];
        if(pg.kirchhoff) pgl.push(pg);
      }
    }
    return pgl;
  }
  
  noteByID(id) {
    // NOTE: Note object identifiers have syntax #cluster name#time stamp#.
    const parts = id.split('#');
    // Check whether the identifier matches this syntax.
    if(parts.length === 4 && this.clusters.hasOwnProperty(parts[1])) {
      // If so, get the cluster.
      const c = this.clusters[parts[1]];
      // Then look in this cluster for a note having the specified identifier.
      for(const n of c.notes) {
        if(n.identifier === id) return n;
      }
    }
    return null;
  }

  productByID(id) {
    if(this.products.hasOwnProperty(id)) return this.products[id];
    return null;
  }
  
  processByID(id) {
    if(this.processes.hasOwnProperty(id)) return this.processes[id];
    return null;
  }
  
  clusterByID(id) {
    if(this.clusters.hasOwnProperty(id)) return this.clusters[id];
    return null;
  }
  
  nodeBoxByID(id) {
    if(this.products.hasOwnProperty(id)) return this.products[id];
    if(this.processes.hasOwnProperty(id)) return this.processes[id];
    if(this.clusters.hasOwnProperty(id)) return this.clusters[id];
    return null;
  }
  
  linkByID(id) {
    if(this.links.hasOwnProperty(id)) return this.links[id];
    return null;
  }

  constraintByID(id) {
    if(this.constraints.hasOwnProperty(id)) return this.constraints[id];
    return null;
  }

  actorByID(id) {
    if(this.actors.hasOwnProperty(id)) return this.actors[id];
    return null;
  }
  
  datasetByID(id) {
    if(this.datasets.hasOwnProperty(id)) return this.datasets[id];
    return null;
  }

  equationByID(id) {
    // NOTE: Return the equation's dataset modifier if its selector matches.
    if(this.equations_dataset &&
        this.equations_dataset.modifiers.hasOwnProperty(id)) {
      return this.equations_dataset.modifiers[id];
    }
    return null;
  }
  
  wildcardEquationByID(id) {
    // Return the tuple [dataset modifier, number] holding the first
    // wildcard equation for which the ID (e.g., "abc ??") matches with
    // `id`, or NULL if no match is found.
    // NOTE: `id` must contain a number, not a wildcard.
    if(!this.equations_dataset) return null;
    const ids = Object.keys(this.equations_dataset.modifiers);
    for(const mid of ids) {
      // Skip the modifier ID is identical to `id` (see NOTE above).
      if(mid !== id) {
        const re = wildcardMatchRegex(mid, true);
        if(re) {
          const m = [...id.matchAll(re)];
          if(m.length > 0) {
            const n = parseInt(m[0][1]);
            if(n || n === 0) {
              return [this.equations_dataset.modifiers[mid], n];
            }
          }
        }
      }
    }
    return null;
  }  
  
  namedObjectByID(id) {
    // NOTE: Not only entities, but also equations are "named objects", meaning
    // that their name must be unique in a model (unlike the titles of charts
    // and experiments).
    let obj = this.nodeBoxByID(id);
    if(obj) return obj;
    obj = this.actorByID(id);
    if(obj) return obj;
    obj = this.datasetByID(id);
    if(obj) return obj;
    return this.equationByID(id);
  }
  
  datasetKeysByPrefix(prefix) {
    // Return the list of datasets having the specified prefix.
    const
        pid = UI.nameToID(prefix + UI.PREFIXER),
        kl = [];
    for(const k of Object.keys(this.datasets)) {
      if(k.startsWith(pid)) kl.push(k);
    }
    return kl;
  }
  
  equationsByPrefix(prefix) {
    // Return the list of datasets having the specified prefix.
    const
        pid = UI.nameToID(prefix + UI.PREFIXER),
        el = [];
    for(const k of Object.keys(this.equations_dataset.modifiers)) {
      if(k.startsWith(pid)) el.push(this.equations_dataset.modifiers[k]);
    }
    return el;    
  }

  chartByID(id) {
    if(!id.startsWith(this.chart_id_prefix)) return null;
    const n = parseInt(endsWithDigits(id));
    if(isNaN(n) || n >= this.charts.length) return null;
    return this.charts[n];
  }
  
  chartsByPrefix(prefix) {
    // Return the list of charts having a title with the specified prefix.
    const
        pid = prefix + UI.PREFIXER,
        cl = [];
    for(const c of this.charts) {
      if(c.title.startsWith(pid)) cl.push(c);
    }
    return cl;
  }
  
  objectByID(id) {
    let obj = this.namedObjectByID(id);
    if(obj) return obj;
    obj = this.linkByID(id);
    if(obj) return obj;
    obj = this.constraintByID(id);
    if(obj) return obj;
    obj = this.noteByID(id);
    if(obj) return obj;
    return this.chartByID(id);
  }

  objectByName(name) {
    // Look up a named object based on its display name.
    // NOTE: Top cluster is uniquely identified by its name.
    if(name === UI.TOP_CLUSTER_NAME || name === UI.FORMER_TOP_CLUSTER_NAME) {
      return this.clusters[UI.nameToID(UI.TOP_CLUSTER_NAME)];
    }
    // Other names must be converted to an ID.
    for(const sym of [UI.LINK_ARROW, UI.CONSTRAINT_ARROW]) {
      if(name.indexOf(sym) >= 0) {
        // NOTE: Link IDs are based on node codes, not node names
        const nn = name.split(sym),
            // NOTE: recursive calls to objectByName
            fn = this.objectByName(nn[0]),
            tn = this.objectByName(nn[1]);
        if(sym === UI.LINK_ARROW) {
          // NOTE: three underscores denote the link arrow
          if(fn && tn) return this.linkByID(fn.code + '___' + tn.code);
          return null;
        } else {
          // NOTE: four underscores denote the constraint arrow
          if(fn && tn) return this.constraintByID(fn.code + '____' + tn.code);
          return null;          
        }
      }
    }
    // No link? then standard conversion to ID
    return this.namedObjectByID(UI.nameToID(name));
  }
  
  validVariable(name) {
    // Return TRUE if `name` references an entity plus valid attribute.
    const
        ea = name.split('|'),
        en = ea[0].trim(),
        e = this.objectByName(en);
    if(!e) return `Unknown model entity "${en}"`;
    const
        ao = (ea.length > 1 ? ea[1].split('@') : ['']),
        a = ao[0].trim();
    // Valid if no attribute, as all entity types have a default attribute. 
    if(!a) return true;
    // Attribute should be valid for the entity type.
    const
        et = e.type.toLowerCase(),
        ac = VM.attribute_codes[VM.entity_letter_codes[et]];
    if(ac.indexOf(a) >= 0 || (e instanceof Cluster && a.startsWith('=')) ||
        (e instanceof Dataset && e.modifiers.hasOwnProperty(a.toLowerCase()))) {
      return true;
    }
    if(e instanceof Dataset) return `Dataset ${e.displayName} has no modifier "${a}"`;
    return `Invalid attribute "${a}"`;
  }
  
  setByType(type) {
    // Return a "dictionary" object with entities of the specified types.
    type = type.toLowerCase();
    if(type === 'process') return this.processes;
    if(type === 'product') return this.products;
    if(type === 'cluster') return this.clusters;
    // NOTE: The returned "dictionary" also contains the equations dataset.
    if(type === 'dataset') return this.datasets;
    if(type === 'link') return this.links;
    if(type === 'constraint') return this.constraints;
    if(type === 'actor') return this.actors;
    return {};
  }
  
  get allEntities() {
    // Return a "dictionary" of all entities in the model.
    // NOTE: This includes equations (instances of DatasetModifier) but
    // not the equations dataset itself.
    const all = Object.assign({}, this.processes, this.products,
        this.clusters, this.datasets, this.equations_dataset.modifiers,
        this.links, this.actors, this.constraints);
    // Remove the equations dataset from this dictionary
    delete all[this.equations_dataset.identifier];
    return all;
  }
  
  get allMethods() {
    // Return a list with dataset modifiers that are "methods".
    const
        list = [],
        keys = Object.keys(this.equations_dataset.modifiers);
    for(const k of keys) {
      if(k.startsWith(':')) {
        list.push(this.equations_dataset.modifiers[k]);
      }
    }
    return list;
  }
  
  get includedModules() {
    // Returns a look-up object {name: count} for modules that
    // have been included.
    const im = {};
    for(const k of Object.keys(this.clusters)) {
      const c = this.clusters[k];
      if(c.module) {
        const n = c.module.name;
        if(im.hasOwnProperty(n)) {
          im[n].push(c);
        } else {
          im[n] = [c];
        }
      }
    }
    return im;
  }
  
  endsWithMethod(name) {
    // Return method (instance of DatasetModifier) if `name` ends with
    // ":(whitespace)m" for some method having selector ":m".
    for(const m of this.allMethods) {
      const re = new RegExp(
          ':\\s*' + escapeRegex(m.selector.substring(1)) + '$', 'i');
      if(name.match(re)) return m;
    }
    return null;
  }
  
  entitiesWithAttribute(attr, et='ABCDLPQ') {
    // Return a list of entities (of any type) having the specified attribute.
    const list = [];
    if(attr === '' && et.indexOf('D') >= 0) {
      // Only datasets can have a value for "no attribute".
      for(let k in this.datasets) if(this.datasets.hasOwnProperty(k)) {
        // NOTE: Ignore the equations dataset.
        if(this.datasets[k] !== this.equations_dataset) {
          list.push(this.datasets[k]);
        }
      }
      // No other types of entity, so return this list.
      return list;
    }
    if(VM.process_attr.indexOf(attr) >= 0 && et.indexOf('P') >= 0) {
      for(let k in this.processes) if(this.processes.hasOwnProperty(k)) {
        list.push(this.processes[k]);
      }
    }
    if(VM.product_attr.indexOf(attr) >= 0 && et.indexOf('Q') >= 0) {
      for(let k in this.products) if(this.products.hasOwnProperty(k)) {
        list.push(this.products[k]);
      }
    }
    if(VM.cluster_attr.indexOf(attr) >= 0 && et.indexOf('C') >= 0) {
      for(let k in this.clusters) if(this.clusters.hasOwnProperty(k)) {
        list.push(this.clusters[k]);
      }
    }
    if(VM.link_attr.indexOf(attr) >= 0 && et.indexOf('L') >= 0) {
      for(let k in this.links) if(this.links.hasOwnProperty(k)) {
        list.push(this.links[k]);
      }
    }
    if(VM.constraint_attr.indexOf(attr) >= 0 && et.indexOf('B') >= 0) {
      for(let k in this.constraints) if(this.constraints.hasOwnProperty(k)) {
        list.push(this.constraints[k]);
      }
    }
    if(VM.actor_attr.indexOf(attr) >= 0 && et.indexOf('A') >= 0) {
      for(let k in this.actors) if(this.actors.hasOwnProperty(k)) {
        list.push(this.actors[k]);
      }
    }
    return list;
  }
  
  allMatchingEntities(re, attr='') {
    // Return list of enties with a display name that matches RegExp `re`,
    // and having attribute `attr` if specified.
    // NOTE: This routine is computationally intensive as it performs
    // matches on the display names of entities while iterating over all
    // relevant entity sets.
    const
        me = [],
        res = re.toString();
        
    function scan(dict) {
      // Try to match all entities in `dict`.
      // NOTE: Ignore method identifiers.
      for(let k in dict) if(dict.hasOwnProperty(k) && !k.startsWith(':')) {
        const
            e = dict[k],
            m = [...e.displayName.matchAll(re)];
        if(m.length > 0) {
          // If matches, ensure that the groups have identical values
          const n = parseInt(m[0][1]);
          let same = true;
          for(let i = 1; same && i < m.length; i++) {
            same = parseInt(m[i][1]) === n;
          }
          // If so, add the entity to the set.
          if(same) me.push(e);
        }
      }  
    }
    
    // Links limit the search (constraints have no attributes => skip).
    if(res.indexOf(UI.LINK_ARROW) >= 0) {
      scan(this.links);
    } else {
      // First get list of matching datasets.
      scan(this.datasets);
      if(me.length > 0 && attr) {
        // If attribute is specified, retain only datasets having a
        // modifier with selector = `attr`.
        for(let i = me.length - 1; i >= 0; i--) {
          if(!me[i].modifiers[attr]) me.splice(i, 1);
        }
      }
      attr = attr.toUpperCase();
      if(!attr || VM.actor_attr.indexOf(attr) >= 0) scan(this.actors);
      if(!attr || VM.cluster_attr.indexOf(attr) >= 0) scan(this.clusters);
      if(!attr || VM.process_attr.indexOf(attr) >= 0) scan(this.processes);
      if(!attr || VM.product_attr.indexOf(attr) >= 0) scan(this.products);
      // NOTE: Equations cannot have an attribute.
      if(!attr && this.equations_dataset) scan(this.equations_dataset.modifiers);
    }
    return me;
  }
  
  entitiesEndingOn(s, attr='') {
    // Return a list of entities (of any type) having a display name that
    // ends on string `s`.
    // NOTE: The current implementation will overlook links having a FROM
    // node that ends on `s`.
    const re = new RegExp(escapeRegex(s) + '$', 'gi');
    return this.allMatchingEntities(re, attr);
  }

  entitiesInString(s) {
    // Return a list of entities referenced in string `s`.
    if(s.indexOf('[') < 0) return [];
    const
        el = [],
        ml = [...s.matchAll(/\[(\{[^\}]+\}){0,1}([^\]]+)\]/g)];
    for(const m of ml) {
      // NOTE: Match group m[0] will be '[', m[1] the optional experiment
      // run specifier, and m[3] the closing bracket ']'.
      const n = m[2].trim();
      let sep = n.lastIndexOf('|');
      if(sep < 0) sep = n.lastIndexOf('@');
      const
          en = (sep < 0 ? n : n.substring(0, sep)).trim(),
          e = this.objectByName(en);
      if(e) addDistinct(e, el);
    }
    return el;
  }
  
  get clustersToIgnore() {
    // Return a "dictionary" with all clusters that are to be ignored.
    const cti = {};
    for(let k in this.clusters) if(this.clusters.hasOwnProperty(k)) {
      if(this.clusters[k].toBeIgnored) cti[k] = true;
    }
    return cti;
  }
  
  inferIgnoredEntities() {
    // Makes a "dictionary" with all processes, products and links that are
    // to be ignored when solving the model.
    const cti = this.clustersToIgnore;
    let pti = [];
    this.ignored_entities = Object.assign({}, cti);
    for(let k in this.processes) if(this.processes.hasOwnProperty(k)) {
      const cid = this.processes[k].cluster.identifier;
      if(cti[cid]) {
        // Add identifier of the process.
        this.ignored_entities[k] = true;
        // Also add identifiers for all its links.
        const p = this.processes[k];
        for(const l of p.inputs) {
          this.ignored_entities[l.identifier] = true;
          addDistinct(l.from_node, pti);
        }
        for(const l of p.outputs) {
          this.ignored_entities[l.identifier] = true;
          addDistinct(l.to_node, pti);
        }
      }
    }
    // Now `pti` holds products that MAY be ignorable.
    while(pti.length > 0) {
      // `new_pti` will hold data products that may ALSO be ignored.
      const new_pti = [];
      for(const p of pti) if(p.allLinksIgnored) {
        this.ignored_entities[p.identifier] = true;
        // Data products may also link to other data products.
        if(p.is_data) {
          // These outgoing data links can also be ignored.
          for(const l of p.outputs) {
            const k = l.identifier;
            if(!this.ignored_entities[k]) {
              // Link not already ignored => add it...
              this.ignored_entities[k] = true;
              // ... and then its TO-node MAY also be ignorable ...
              const tn = l.to_node;
              if(tn.is_data && !this.ignored_entities[tn.identifier]) {
                //... if it is a data product that is not already ignored 
                new_pti.push(tn);
              }
            }
          }
        }
      }
      // Iterate until no more new products-that-may-be-gnored are found.
      pti = new_pti;
    }
    // Catch-all -- appears to be needed, still -- @@TO DO: figure out why.
    for(let k in this.links) if(this.links.hasOwnProperty(k)) {
      const l = this.links[k];
      if(!this.ignored_entities[k] &&
          (this.ignored_entities[l.from_node.identifier] ||
              this.ignored_entities[l.to_node.identifier])) {
        this.ignored_entities[k] = true;
      }
    }
    // Ignore all constraints having FROM and/or TO node set to be ingnored.
    for(let k in this.constraints) if(this.constraints.hasOwnProperty(k)) {
      const c = this.constraints[k];
      if(this.ignored_entities[c.from_node.identifier] ||
          this.ignored_entities[c.to_node.identifier]) {
        this.ignored_entities[k] = true;
      }
    }
  }
  
  inferBlackBoxEntities() {
    // Make a "dictionary" with for all processes, products and "black-boxed"
    // datasets an entry identifier: "black-boxed" name.
    // NOTE: "black-boxed" names are prefixed numbers, where the parentheses
    // in the prefix ensure that the IDs cannot double with normal entity names.
    let n = 1;
    this.black_box_entities = {};
    for(let k in this.processes) if(this.processes.hasOwnProperty(k)) {
      const p = this.processes[k];
      // Processes are added when their cluster is a black box
      if(!k.startsWith(UI.BLACK_BOX) && p.cluster.black_box) {
        let nn = UI.BLACK_BOX_PREFIX + `(process ${n})`;
        if(p.hasActor) nn += ` (${p.actor.name})`;
        this.black_box_entities[k] = nn;
        n++;
      }
    }
    n = 1;
    for(let k in this.products) if(this.products.hasOwnProperty(k)) {
      const p = this.products[k];
      // Products are added when they occur only in "black box" clusters
      if(!k.startsWith(UI.BLACK_BOX) && p.toBeBlackBoxed && !this.ioType(p)) {
        this.black_box_entities[k] = UI.BLACK_BOX_PREFIX + `(product ${n})`;
        n++;
      }
    }
    n = 1;
    for(let k in this.datasets) if(this.datasets.hasOwnProperty(k)) {
      const ds = this.datasets[k];
      // Datasets are added when they are marked as "black boxed"
      if(!k.startsWith(UI.BLACK_BOX) && ds.black_box && !this.ioType(ds)) {
        this.black_box_entities[k] = UI.BLACK_BOX_PREFIX + `(dataset ${n})`;
        n++;
      }
    }
  }
  
  inferPrefix(obj) {
    // Return the inferred (!) prefixes of `obj` as a list.
    if(obj) {
      const pl = UI.prefixesAndName(obj.displayName);
      if(pl.length > 1) {
        pl.pop();
        return pl;
      }
    }
    return [];
  }
  
  inferParentCluster(obj) {
    // Find the best "parent" cluster for link or constraint `obj`.
    let p, q;
    if(obj.from_node instanceof Product) {
      p = obj.from_node;
      q = obj.to_node;
    } else {
      p = obj.to_node;
      q = obj.from_node;
    }
    // If P is a process, BOTH nodes are processes (so `obj` is a constraint);
    // then focus on the constrained node P. NOTE: this is an arbitrary choice!
    if(p instanceof Process) return p.cluster;
    // For a link or constraint related to a process, focus on the process.
    if(q instanceof Process) return q.cluster;
    // Now both P and Q are products => look for a cluster that shows both.
    const
        pcl = p.productPositionClusters,
        qcl = q.productPositionClusters;
    let c = null,
        hc = null,
        lnl = 100000;
    // Look for shared parent cluster; meanwhile, keep track of the "highest"
    // parent cluster of P, i.e., the cluster having the lowest nesting level.
    for(const pc of pcl) {
      const nl = pc.nestingLevel;
      if(nl < lnl) {
        lnl = nl;
        hc = pc;
      }
      if(qcl.indexOf(pc) >= 0) c = pc;
      break;
    }
    if(!c) {
      // Different clusters => focus on the "higher" cluster in the tree.
      c = hc;
      for(const qc of qcl) {
        const nl = qc.nestingLevel;
        if(nl < lnl) {
          lnl = nl;
          c = qc;
        }
      }
    }
    return c;
  }

  indexOfChart(t) {
    // Return the index of a chart having title `t` in the model's chart list.
    // NOTE: Titles should not be case-sensitive.
    t = t.toLowerCase();
    for(let index = 0; index < this.charts.length; index++) {
      if(this.charts[index].title.toLowerCase() === t) return index;
    }
    return -1;
  }

  indexOfExperiment(t) {
    // Return the index of an experiment having title `t` in the model's
    // experiment list.
    // NOTE: Titles should not be case-sensitive.
    t = t.toLowerCase();
    for(let index = 0; index < this.experiments.length; index++) {
      // NOTE: Use nameToID to
      if(this.experiments[index].title.toLowerCase() === t) return index;
    }
    return -1;
  }
  
  validSelector(name) {
    // Return sanitized selector name, or empty string if invalid.
    const s = name.replace(/[^a-zA-Z0-9\+\-\%\_\*\?]/g, '');
    let msg = '';
    if(s !== name) {
      msg = UI.WARNING.SELECTOR_SYNTAX;
    } else if(name.indexOf('*') !== name.lastIndexOf('*')) {
      // A selector can only contain 1 star.
      msg = UI.WARNING.SINGLE_WILDCARD;
    }
    if(msg) {
      UI.warn(msg);
      return '';
    }
    return s;    
  }
  
  isDimensionSelector(s) {
    // Return TRUE if `s` is a dimension selector in some experiment.
    for(const x of this.experiments) {
      if(x.isDimensionSelector(s)) return true;
    }
    return false;
  }

  canLink(from, to) {
    // Return TRUE iff FROM-node can feature a "straight" link (i.e., a
    // product flow) to TO-node.
    if(from.type === to.type) {
      // No "straight" link between nodes of same type (see canConstrain
      // for "curved" links) UNLESS TO-node is a data product.
      if(!to.is_data) return false;
    }
    // No links to actor cash flow data products.
    if(to.name.startsWith('$')) return false;
    // No links from actor cash flow data to processes.
    if(from.name.startsWith('$') && to instanceof Process) return false;
    // At most ONE link A --> B, so FALSE if such a link already exists.
    for(const l of from.outputs) if(l.to_node === to) return false;
    // No link A --> B if there already exists a link B --> A.
    for(const l of to.outputs) if(l.to_node === from) return false;
    return true;
  }

  isConstrained(node) {
    // Return the constraint that node is involved in if such constraint
    // exists, and otherwise NULL. 
    let c = null;
    for(c in this.constraints) if(this.constraints.hasOwnProperty(c)) {
      c = this.constraints[c];
      if(c.from_node == node || c.to_node == node) return c;
    }
    return null;
  }

  get runLength() {
    // Return the number of time steps to by computed for a simulation.
    // NOTE: This includes a final lookahead period.
    return this.end_period - this.start_period + 1 + this.look_ahead;
  }
  
  processSelectorList(sl) {
    // Checke whether selector list `sl` constitutes a new dimension.
    // Ignore lists of fewer than 2 "plain" selectors.
    if(sl.length > 1) {
      let newdim = true;
      // Merge into dimension if there are shared selectors.
      for(const d of this.dimensions) {
        const c = complement(sl, d);
        if(c.length < sl.length) {
          if(c.length > 0) d.push(...c);
          newdim = false;
          break;
        }
      }
      // If only new selectors, add the list as a dimension.
      if(newdim) this.dimensions.push(sl);
    }
  }
  
  inferDimensions() {
    // Generate the list of dimensions for experimental design.
    // NOTE: A dimension is a list of one or more relevant selectors.
    this.dimensions.length = 0;
    // NOTE: Ignore the equations dataset.
    for(let k in this.datasets) if(this.datasets.hasOwnProperty(k) &&
        this.datasets[k] !== this.equations_dataset) {
      // Get the selector list for this dataset.
      // NOTE: Ignore wildcard selectors!
      this.processSelectorList(this.datasets[k].plainSelectors);
    }
    // Analyze constraint bound lines in the same way.
    for(let k in this.constraints) if(this.constraints.hasOwnProperty(k)) {
      // Get selector list.
      const c = this.constraints[k];
      for(const bl of c.bound_lines) {
        const sl = bl.selectorList;
        // NOTE: Ignore the first selector "(default)".
        sl.shift();
        this.processSelectorList(sl);
      }
    }
  }

  expandDimension(sl) {
    // Find dimension that overlaps with stringlist `sl`, and expand it.
    for(const dim of this.dimensions) {
      const c = complement(sl, dim);
      if(c.length > 0 && c.length < sl.length) {
        dim.push(...c);
        break;
      }
    }
    // Likewise update dimensions of experiments.
    for(const x of this.experiments) {
      for(const dim of x.dimensions) {
        const c = complement(sl, dim);
        if(c.length > 0 && c.length < sl.length) {
          dim.push(...c);
          break;
        }
      }
    }
    // Update the Experiment Manager.
    UI.updateControllerDialogs('X');
  }

  updateDimensions() {
    // Infer dimensions, detect changes, and apply them to experiments.
    // First make a copy of the "old" dimensions.
    const od = [];
    for(const dim of this.dimensions) {
      od.push(dim.slice());
    }
    // Then infer dimensions from the datasets (which have been changed).
    this.inferDimensions();
    // Find dimension that has been removed (or only reduced).
    let removed = null,
        reduced = null;
    if(od.length > this.dimensions.length) {
      // Dimension removed => find out which one.
      for(const rd of od) {
        let match = false;
        for(const dim of this.dimensions) {
          if(intersection(rd, dim).length === rd.length) {
            match = true;
            break;
          }
        }
        if(!match) {
          removed = rd;
        }
      }
    } else {
      // See if a dimension has been reduced.
      for(const rd of od) {
        for(const dim of this.dimensions) {
          const l = intersection(rd, dim).length;
          // Non-empty intersection, but with fewer elements.
          if(l > 0 && l < rd.length) {
            reduced = dim;
            break;
          }
        }
      }
    }
    if(reduced || removed) {
      // Update rows and columns of experiments.
      if(reduced) {
        for(const x of this.experiments) {
          x.reduceDimension(reduced);
        }
      } else if(removed) {
        for(const x of this.experiments) {
          x.removeDimension(removed);
        }
      }
      UI.updateControllerDialogs('X');
    }
  }

  renameSelectorInExperiments(olds, news) {
    // Replace all occurrences of `olds` in dimension strings by `news`.
    for(const x of this.experiments) {
      x.renameSelectorInDimensions(olds, news);
    }
  }

  ignoreClusterInThisRun(c) {
    // Return TRUE iff an experiment is running and cluster `c` is in the
    // clusters-to-ignore list and its selectors in this list overlap with the
    // current combination.
    if(!this.running_experiment) return false;
    const cti = this.running_experiment.clusters_to_ignore;
    // NOTE: Use FALSE, as empty selectors string denotes "any selector".
    let sels = false;
    for(let i = 0; i < cti.length && sels === false; i++) {
      if(cti[i].cluster === c) sels = cti[i].selectors;
    }
    if(sels === false) return false;
    // Return TRUE if selectors and actual dimensions have common elements.
    const
        ac = this.running_experiment.activeCombination,
        ss = intersection(sels.split(' '), ac);
    return ss.length > 0;
  }

  renamePrefixedDatasets(old_prefix, new_prefix, subset=null) {
    // Rename all datasets having the specified old prefix so that they
    // have the specified new prefix UNLESS this would cause name conflicts.
    // NOTE: If `subset` is defined, limit renaming to the datasets it contains.
    const
        oldkey = old_prefix.toLowerCase().split(UI.PREFIXER).join(':_'),
        newkey = new_prefix.toLowerCase().split(UI.PREFIXER).join(':_'),
        dskl = [];
    // No change if new prefix is identical to old prefix.
    if(old_prefix !== new_prefix) { 
      for(let k in MODEL.datasets) if(MODEL.datasets.hasOwnProperty(k)) {
        if(k.startsWith(oldkey) &&
            (!subset || subset.indexOf(MODEL.datasets[k]) >= 0)) dskl.push(k);
      }
      // NOTE: No check for name conflicts needed when name change is
      // merely some upper/lower case change.
      if(newkey !== oldkey) {
        let nc = 0;
        for(const k of dskl) {
          const nk = newkey + k.substring(oldkey.length);
          if(MODEL.datasets[nk]) nc++;
        }
        if(nc) {
          UI.warn('Renaming ' + pluralS(dskl.length, 'dataset') +
              ' would cause ' + pluralS(nc, 'name conflict'));
          return false;
        }
      }
      // Reset counts of effects of a rename operation.
      this.variable_count = 0;
      this.expression_count = 0;
      // Rename datasets one by one, suppressing notifications.
      // NOTE: Make a list of renamed datasets.
      const rdsl = [];
      for(const k of dskl) {
        const
            ds = this.datasets[k],
            // NOTE: When old prefix is empty string, add instead of replace.
            nn = (old_prefix ? ds.displayName.replace(old_prefix, new_prefix) :
                new_prefix + ds.displayName);
        rdsl.push(ds.rename(nn, false));
      }
      if(subset) {
        // Update the specified subset so it contains the renamed datasets.
        subset.length = 0;
        subset.push(...rdsl);
      } else {
        let msg = 'Renamed ' + pluralS(dskl.length, 'dataset').toLowerCase();
        if(this.variable_count) msg += ', and updated ' +
            pluralS(this.variable_count, 'variable') + ' in ' +
            pluralS(this.expression_count, 'expression');
        UI.notify(msg);
        if(EXPERIMENT_MANAGER.selected_experiment) {
          EXPERIMENT_MANAGER.selected_experiment.inferVariables();
        }
        UI.updateControllerDialogs('CDEFJX');
      }
    }
    return true;
  }
  
  //
  //  Methods that add an entity to the model
  //

  addActor(name, node=null) {
    // Add actor to the model.
    name = UI.cleanName(name);
    if(name === '') return this.actors[UI.nameToID(UI.NO_ACTOR)];
    const id = UI.nameToID(name),
          iot = (IO_CONTEXT ? IO_CONTEXT.isBound(name) : 0);
    if(!this.actors.hasOwnProperty(id)) {
      this.actors[id] = new Actor(name);
      if(node) {
        this.actors[id].initFromXML(node);
      }
    } else if(iot === 2 && name !== UI.NO_ACTOR) {
      // NOTE: initFromXML only when actor is exported.
      this.actors[id].initFromXML(node);
      IO_CONTEXT.supersede(this.actors[id]);
    }
    return this.actors[id];
  }

  addScaleUnit(name, scalar='1', base_unit='1') {
    // Add a scale unit to the model, and return its symbol.
    //  (1) To permit things like 1 kWh = 3.6 MJ, and 1 GJ = 1000 MJ,
    //      scale units have a multiplier and a base unit; by default,
    //      multiplier = 1 and base unit = '1' to denote "atomic unit".
    //  (2) Linny-R remains agnostic about physics, SI standards etc.
    //      so modelers can do anything they like.
    //  (3) Linny-R may in the future be extended with a unit consistency
    //      check.
    name = UI.cleanName(name);
    // NOTE: Empty string denotes default unit, so test this first to
    // avoid a warning .
    if(!name) return this.default_unit;
    // NOTE: do not replace or modify an existing scale unit.
    if(!this.scale_units.hasOwnProperty(name)) {
      this.scale_units[name] = new ScaleUnit(name, scalar, base_unit);
      UI.updateScaleUnitList();
    }
    return name;
  }
  
  addPreconfiguredScaleUnits() {
    // Add scale units defined in file `config.js` (by default: none).
    for(const su of CONFIGURATION.scale_units) this.addScaleUnit(...su);
  }
  
  cleanUpScaleUnits() {
    // Remove all scale units that are not used and have base unit '1'.
    const suiu = {};
    // Collect all non-empty product units.
    for(let p in this.products) if(this.products.hasOwnProperty(p)) {
      const su = this.products[p].scale_unit;
      if(su) suiu[su] = true;
    }
    // Likewise collect all non-empty dataset units.
    for(let ds in this.datasets) if(this.datasets.hasOwnProperty(ds)) {
      const su = this.datasets[ds].scale_unit;
      if(su) suiu[su] = true;
    }
    // Also collect base units and units having base unit other than '1'.
    for(let su in this.scale_units) if(this.scale_units.hasOwnProperty(su)) {
      const u = this.scale_units[su];
      suiu[u.base_unit] = true;
      if(u.base_unit !== '1') suiu[u.name] = true;
    }
    // Now all scale units NOT in `suiu` can be removed.
    for(let su in this.scale_units) if(this.scale_units.hasOwnProperty(su)) {
      if(!suiu.hasOwnProperty(su)) {
        delete this.scale_units[su];
      }
    }
  }
  
  renameScaleUnit(oldu, newu) {
    let nr = 0;
    // Update the default product unit.
    if(MODEL.default_unit === oldu) {
      MODEL.default_unit = newu;
      nr++;
    }
    // Rename product scale units.
    for(let p in MODEL.products) if(MODEL.products.hasOwnProperty(p)) {
      if(MODEL.products[p].scale_unit === oldu) {
        MODEL.products[p].scale_unit = newu;
        nr++;
      }
    }
    // Rename product and dataset units.
    for(let ds in MODEL.datasets) if(MODEL.datasets.hasOwnProperty(ds)) {
      if(MODEL.datasets[ds].scale_unit === oldu) {
        MODEL.datasets[ds].scale_unit = newu;
        nr++;
      }
    }
    // Also rename conversion units in note fields.
    for(let k in MODEL.clusters) if(MODEL.clusters.hasOwnProperty(k)) {
      for(const n of MODEL.clusters[k].notes) {
        const tags = n.tagList;
        if(tags) {
          for(const ot of tags) {
            const
                parts = ot.split('->'), 
                last = parts.pop().trim();
            if(last === oldu + ']]') {
              const nt = parts.join('->') + `->${newu}]]`; 
              n.contents = n.contents.replace(ot, nt);
            }
          }
          n.parsed = false;
        }
      }
    }
    // Also rename scale units in expressions (quoted if needed).
    oldu = UI.nameAsConstantString(oldu);
    newu = UI.nameAsConstantString(newu);
    const ax = MODEL.allExpressions;
    if(oldu.startsWith("'")) {
      // Simple case: replace quoted old unit by new.
      for(const x of ax) {
        let parts = x.text.split(oldu);
        nr += parts.length - 1;
        x.text = parts.join(newu);
      }
    } else {
      // Old unit is not enclosed in quotes; then care must be taken
      // not to replace partial matches, e.g., kton => ktonne when 'ton'
      // is renamed to 'tonne'; solution is to ensure that old unit must
      // have a separator character on both sides, or it is not replaced.
      const
          sep = SEPARATOR_CHARS + "]'",
          esep = escapeRegex(sep),
          eou = escapeRegex(oldu),
          raw = `\[[^\[]*\]|(^|\s|[${esep}])(${eou})($|\s|[${esep}])`;
      const
          // NOTE: This will match anything within brackets, and the unit.
          re = new RegExp(raw, 'g');
      // Iterate over all expressions.
      for(const x of ax) {
        let ot = x.text,
            nt = '',
            m = re.exec(ot);
        while (m !== null) {
          // NOTE: A match with the unit name will have 3 groups, and the
          // middle one (so element with index 2) should then be equal to
          // the unit name; other matches will be bracketed text that
          // should be ignored.
          if(m.length > 2 && m[2] === oldu) {
            // NOTE: lastIndex points right after the complete match,
            // and this match m[0] can have separator characters on both
            // sides which should not be removed.
            const
                parts = m[0].split(oldu),
                left = parts[0].split('').pop(),
                right = (parts[1] ? parts[1].split('')[0] : '');
            // NOTE: If one separator is a single quote, the the other
            // must also be a single quote (to avoid 'ton/m3' to be
            // renamed when 'ton' is renamed).
            if(!((left === "'" || right === "'") && left !== right) &&
                sep.indexOf(left) >= 0 && sep.indexOf(right) >= 0) {
              // Separator chars on both side => use lastIndex.
              nt += ot.slice(0, re.lastIndex - m[0].length) + parts.join(newu);
              ot = ot.slice(re.lastIndex);
            }
          }
          m = re.exec(ot);
        }
        if(nt) {
          x.text = nt + ot;
          nr++;
        }
      }
    }
    if(nr) {
      UI.notify(pluralS(nr, 'scale unit') + ' renamed');
      UI.drawDiagram(MODEL);
    }
  }
  
  unitConversionMultiplier(from, to) {
    // Compute and return the FROM : TO unit conversion rate.
    // NOTE: No conversion if TO is the primitive unit.
    if(from === to || to === '1' || to === '') return 1;
    const fsu = this.scale_units[from];
    if(fsu) { 
       const fcr = fsu.conversionRates();
       if(fcr.hasOwnProperty(to)) return fcr[to];
    }
    return VM.UNDEFINED;
  }
  
  addPowerGrid(id, node=null) {
    // Add a power grid to the model.
    let pg = new PowerGrid(id);
    if(node) pg.initFromXML(node);
    this.power_grids[id] = pg;
    return pg;
  }
  
  addNote(node=null) {
    // Add a note to the focal cluster.
    let n = new Note(this.focal_cluster);
    if(node) n.initFromXML(node);
    this.focal_cluster.notes.push(n);
    return n;
  }

  addCluster(name, actor_name, node=null) {
    // NOTE: Adapt XML saved by legacy Linny-R software.
    if(name === UI.FORMER_TOP_CLUSTER_NAME ||
        name === UI.LEGACY_TOP_CLUSTER_NAME) {
      name = UI.TOP_CLUSTER_NAME;
    }
    // Set actor name if it is specified in the IO context.
    if(IO_CONTEXT && name === IO_CONTEXT.prefix && IO_CONTEXT.actor_name !== '') {
      if(actor_name === '' || actor_name === UI.NO_ACTOR) {
        actor_name = IO_CONTEXT.actor_name;
      }
    }
    const actor = this.addActor(actor_name);
    name = UI.cleanName(name);
    if(!UI.validName(name)) {
      UI.warningInvalidName(name);
      return null;
    }
    const n = name + (actor.name != UI.NO_ACTOR ? ` (${actor.name})` : '');
    let c = this.namedObjectByID(UI.nameToID(n));
    if(c !== null) {
      // Preserve name uniqueness.
      if(!(c instanceof Cluster)) {
        UI.warningEntityExists(c);
        return null;
      }
      if(IO_CONTEXT) IO_CONTEXT.supersede(c);
      if(node) c.initFromXML(node);
      return c;
    }
    c = new Cluster(this.focal_cluster, name, actor);
    this.clusters[c.identifier] = c;
    // Do not add cluster as sub-cluster of itself (applies to TOP CLUSTER).
    if(this.focal_cluster && c !== this.focal_cluster) {
      this.focal_cluster.sub_clusters.push(c);
    }
    c.resize();
    if(node) c.initFromXML(node);
    return c;
  }

  addProcess(name, actor_name, node=null) {
    const actor = this.addActor(actor_name);
    name = UI.cleanName(name);
    if(!UI.validName(name)) {
      UI.warningInvalidName(name);
      return null;
    }
    const n = name + (actor.name != UI.NO_ACTOR ? ` (${actor.name})` : '');
    let nb = this.namedObjectByID(UI.nameToID(n));
    if(nb) {
      // If process by this name already exists, return it.
      if(nb instanceof Process) {
        if(IO_CONTEXT) {
          // NOTE: This should NEVER occur because processes are always prefixed.
          IO_CONTEXT.supersede(nb);
        }
        return nb;
      }
      // Otherwise, warn the modeler.
      UI.warningEntityExists(nb);
      return null;
    }
    const p = new Process(this.focal_cluster, name, actor);
    if(node) p.initFromXML(node);
    p.setCode();
    this.processes[p.identifier] = p;
    this.focal_cluster.processes.push(p);
    p.resize();
    // Adding a new process affects dependencies, so prepare its cluster
    // for redrawing the diagram.
    p.cluster.clearAllProcesses();
    return p;
  }

  addProduct(name, node=null) {
    name = UI.cleanName(name);
    // Leading dollar sign indicates an actor cash flow data product.
    if(!UI.validName(name)) {
      UI.warningInvalidName(name);
      return null;
    }
    let nb = this.namedObjectByID(UI.nameToID(name));
    if(nb !== null) {
      // Preserve name uniqueness.
      if(nb instanceof Product) {
        if(IO_CONTEXT) {
          if(IO_CONTEXT.isBound(name) === 2) {
            nb.initFromXML(node);
            IO_CONTEXT.supersede(nb);
          }
        }
        return nb;
      }
      UI.warningEntityExists(nb);
      return null;
    }
    // NOTE: Product nodes have no actor, not even (no actor).
    const p = new Product(this.top_cluster, name, this.addActor(''));
    if(node) p.initFromXML(node);
    p.setCode();
    this.products[p.identifier] = p;
    // NOTE: Cash flow products must be data, and must have the model's
    // currency unit as unit.
    if(p.name.startsWith('$')) {
      p.is_data = true;
      p.unit = MODEL.currency_unit;
    }
    p.resize();
    // New product => prepare for redraw.
    p.cluster.clearAllProcesses();
    return p;
  }

  addLink(from, to, node=null) {
    // NOTE: A link ID has THREE underscores between its node IDs.
    let l = this.linkByID(from.code + '___' + to.code);
    if(l !== null) {
      if(IO_CONTEXT) IO_CONTEXT.supersede(l);
      if(node) l.initFromXML(node);
      return l;
    }
    l = new Link(from, to);
    if(node) l.initFromXML(node);
    this.links[l.identifier] = l;
    from.outputs.push(l);
    to.inputs.push(l);
    this.makePredecessorLists();
    l.is_feedback = (from.predecessors.indexOf(to) >= 0);
    // New link => prepare both related clusters for redraw.
    l.from_node.cluster.clearAllProcesses();
    if(l.to_node.cluster != l.from_node.cluster) {
      l.to_node.cluster.clearAllProcesses();
    }
    // NOTE: For product nodes, it is possible that their cluster is not
    // the focal cluster; in that case, also prepare the focal cluster.
    if(this.focal_cluster != l.from_node.cluster &&
        this.focal_cluster != l.to_node.cluster) {
      this.focal_cluster.clearAllProcesses();
    }
    return l;
  }
  
  addConstraint(from, to, node=null) {
    // NOTE: Constraint ID has FOUR underscores between its node codes.
    let c = this.constraintByID(from.code + '____' + to.code);
    if(c !== null) {
      if(IO_CONTEXT) IO_CONTEXT.supersede(c);
      if(node) c.initFromXML(node);
      return c;
    }
    c = new Constraint(from, to);
    if(node) c.initFromXML(node);
    // New constraint => prepare for redraw.
    c.from_node.cluster.clearAllProcesses();
    if(c.to_node.cluster != c.from_node.cluster) {
      c.to_node.cluster.clearAllProcesses();
    }
    this.constraints[c.identifier] = c;
    return c;
  }
  
  addDataset(name, node=null) {
    name = UI.cleanName(name);
    if(!UI.validName(name)) {
      UI.warningInvalidName(name);
      return null;
    }
    const id = UI.nameToID(name);
    let d = this.namedObjectByID(id);
    if(d && d !== this.equations_dataset) {
      if(IO_CONTEXT) {
        IO_CONTEXT.supersede(d);
      } else {
        // Preserve name uniqueness.
        UI.warningEntityExists(d);
        return null;
      }
    }
    d = new Dataset(name);
    let eqds = null;
    if(name === UI.EQUATIONS_DATASET_NAME) {
      // When including a module, the current equations must be saved,
      // then the newly parsed dataset must have its modifiers prefixed,
      // and then be merged with the original equations dataset.
      if(IO_CONTEXT) eqds = this.equations_dataset;
      // When equations dataset is added, recognize it as such, or its
      // modifier selectors may be rejected while initializing from XML.
      this.equations_dataset = d;
    }
    if(node) d.initFromXML(node);
    if(eqds) {
      // Restore pointer to original equations dataset.
      this.equations_dataset = eqds;
      // Return the extended equations dataset.
      return eqds;
    } else {
      this.datasets[id] = d;
    }
    return d;
  }
  
  addChart(title, node=null) {
    // If chart with given title exists, do not add a new instance.
    const ci = this.indexOfChart(title);
    if(ci >= 0) return this.charts[ci];
    // Otherwise, add it. NOTE: Unlike datasets, charts are not "entities".
    let c = new Chart(title);
    if(node) c.initFromXML(node);
    this.charts.push(c);
    // Sort the chart titles alphabetically...
    this.charts.sort(
        function (a, b) {
          if(a.title === b.title) return 0;
          // ... but ensure that the default chart always comes first.
          if(a.title === CHART_MANAGER.new_chart_title || a.title < b.title) return -1;
          return 1;
        });
    return c;
  }
  
  deleteChart(index) {
    // Delete chart from model.
    if(index < 0 || index >= this.charts.length) return false;
    const c = this.charts[index];
    // NOTE: Do not delete the default chart, but clear it instead.
    if(c.title === CHART_MANAGER.new_chart_title) {
      c.reset();
      return false;
    }
    // Remove chart from all experiments.
    for(const x of this.experiments) {
      const index = x.charts.indexOf(c);
      if(index >= 0) x.charts.splice(index, 1);
    }
    // Remove chart from model.
    this.charts.splice(index, 1);
    CHART_MANAGER.chart_index = -1;
    return true;
  }
  
  addExperiment(title, node=null) {
    // If experiment with given title exists, do not add a new instance.
    title = title.trim();
    if(!title) {
      UI.warn('Experiment must have a title');
      return null;
    }
    const xi = this.indexOfExperiment(title);
    if(xi >= 0) return this.experiments[xi];
    // Otherwise, add it. NOTE: Similar to charts, experiments are not "entities".
    let x = new Experiment();
    x.title = title;
    if(node) x.initFromXML(node);
    this.experiments.push(x);
    // Sort the experiment titles alphabetically.
    this.experiments.sort(
        function (a, b) {
          if(a.title === b.title) return 0;
          if(a.title < b.title) return -1;
          return 1;
        });
    return x;
  }
  
  addImport(obj) {
    // NOTE: Also pass model (`this`), as `obj` may be an XML element that does
    // not "know" the model to which the import is added.
    this.imports.push(new Import(this, obj));
  }
  
  addExport(obj) {
    // NOTE: Also pass model (`this`), as `obj` may be an XML element that does
    // not "know" the model to which the import is added.
    this.exports.push(new Export(this, obj));
  }
  
  ioType(obj) {
    // Return 1 if `obj` is an import, 2 if export, and 0 otherwise.
    if(!(obj instanceof Actor || obj instanceof Dataset ||
        obj instanceof Product)) {
      return 0;
    }
    for(const io of this.imports) if(io.entity === obj) return 1;
    for(const io of this.exports) if(io.entity === obj) return 2;
    return 0;
  }
  
  removeImport(obj) {
    // Remove `obj` from imports if it is an import.
    for(let i = 0; i < this.imports.length; i++) {
      if(this.imports[i].entity === obj) {
        this.imports.splice(i, 1);
        return true;
      }
    }
    return false;
  }
  
  removeExport(obj) {
    // Remove `obj` from exports if it is an export.
    for(let i = 0; i < this.exports.length; i++) {
      if(this.exports[i].entity === obj) {
        this.exports.splice(i, 1);
        return true;
      }
    }
    return false;
  }

  ioUpdate(obj, newio) {
    // Update import/export status if changed.
    const io = this.ioType(obj);
    if(io !== newio) {
      if(io === 1) {
        this.removeImport(obj);
      } else if (io === 2) {
        this.removeExport(obj);
      }
      if(newio === 1) {
        this.addImport(obj);
      } else if(newio === 2) {
        this.addExport(obj);
      }
    }    
  }

  //
  // Methods related to the model diagram layout
  //

  alignToGrid() {
    // Move all positioned model elements to the nearest grid point.
    if(!this.align_to_grid) return;
    let move = false;
    const fc = this.focal_cluster;
    // NOTE: Do not align notes to the grid. This will permit more
    // precise positioning, while aligning will not improve the layout
    // of the diagram because notes are not connected to arrows.
    // However, when notes relate to nearby nodes, preserve their relative
    // position to this node.
    for(const n of fc.notes) {
      const nbn = n.nearbyNode;
      n.nearby_pos = (nbn ? {node: nbn, dx: n.x - nbn.x, dy: n.y - nbn.y} : null);
    }
    for(const p of fc.processes) {
      move = p.alignToGrid() || move;
    }
    for(const pp of fc.product_positions) {
      move = pp.alignToGrid() || move;
    }
    for(const c of fc.sub_clusters) {
      move = c.alignToGrid() || move;
    }
    if(move) {
      // Reposition "associated" notes.
      for(const n of fc.notes) if(n.nearby_pos) {
        // Adjust (x, y) so as to retain the relative position.
        n.x = n.nearby_pos.node.x + n.nearby_pos.dx;
        n.y = n.nearby_pos.node.y + n.nearby_pos.dy;
        n.nearby_pos = null;
      }
      UI.drawDiagram(this);
    }
  }
  
  translateGraph(dx, dy) {
    // Move all entities in the focal cluster by (dx, dy) pixels.
    if(!dx && !dy) return 0;
    const fc = this.focal_cluster;
    for(const p of fc.processes) {
      p.x += dx;
      p.y += dy;
    }
    for(const pp of fc.product_positions) {
      pp.x += dx;
      pp.y += dy;
    }
    for(const c of fc.sub_clusters) {
      c.x += dx;
      c.y += dy;
    }
    for(const n of fc.notes) {
      n.x += dx;
      n.y += dy;
    }
    // NOTE: Force drawing, because SVG must immediately be downloadable.
    UI.drawDiagram(this);
    // If dragging, add (dx, dy) to the properties of the top "move" UndoEdit.
    if(UI.dragged_node) UNDO_STACK.addOffset(dx, dy);
  }

  //
  // Methods related to selection 
  //

  select(obj) {
    obj.selected = true;
    if(this.selection.indexOf(obj) < 0) {
      this.selection.push(obj);
      this.selection_related_arrows.length = 0;
      if(obj instanceof Link) {
        UI.drawLinkArrows(this.focal_cluster, obj);
      } else {
        UI.drawObject(obj);
      }
    }
  }

  deselect(obj) {
    obj.selected = false;
    const index = this.selection.indexOf(obj);
    if(index >= 0) {
      this.selection.splice(index, 1);
      this.selection_related_arrows.length = 0;
    }
    UI.drawObject(obj);
  }

  selectList(list) {
    // Set selection to elements in `ol`.
    // NOTE: First clear present selection without redrawing.
    this.clearSelection(false);
    for(const obj of list) {
      obj.selected = true;
      if(this.selection.indexOf(obj) < 0) this.selection.push(obj);
    }
    this.selection_related_arrows.length = 0;
    // NOTE: does not redraw the graph -- the calling routine should do that
  }
  
  get getSelectionPositions() {
    // Return a list of tuples [x, y] for all selected nodes.
    const pl = [];
    for(let obj of this.selection) {
      if(obj instanceof Product) obj = obj.positionInFocalCluster;
      if(!(obj instanceof Link || obj instanceof Constraint)) {
        pl.push([obj.x, obj.y]);
      }
    }
    return pl;
  }

  setSelectionPositions(pl) {
    // Set position of selected nodes to the [x, y] passed in the list.
    // NOTE: Iterate backwards over the selection ...
    for(let i = this.selection.length - 1; i >= 0; i--) {
      let obj = this.selection[i];
      if(obj instanceof Product) obj = obj.positionInFocalCluster;
      if(!(obj instanceof Link || obj instanceof Constraint)) {
        // ... and apply [X, Y] only to nodes in the selection.
        const xy = pl.pop();
        obj.x = xy[0];
        obj.y = xy[1];
      }
    }
  }

  clearSelection(draw=true) {
    if(this.selection.length > 0) {
      for(const obj of this.selection) {
        obj.selected = false;
        if(draw) {
          if(obj instanceof Link) {
            UI.drawLinkArrows(this.focal_cluster, obj);
          } else {
            UI.drawObject(obj);
          }
        }
      }
    }
    this.selection.length = 0;
    this.selection_related_arrows.length = 0;
  }

  setSelection() {
    // Set selection to contain all selected entities in the focal cluster.
    // NOTE: To be called after loading a model, and after UNDO/REDO (and
    // then before drawing the diagram).
    const fc = this.focal_cluster;
    this.selection.length = 0;
    this.selection_related_arrows.length = 0;
    for(const p of fc.processes) if(p.selected) {
      this.selection.push(p);
    }
    for(const pp of fc.product_positions) if(pp.product.selected) {
      this.selection.push(pp.product);
    }
    for(const c of fc.sub_clusters) if(c.selected) {
      this.selection.push(c);
    }
    for(const n of fc.notes) if(n.selected) {
      this.selection.push(n);
    }
    for(const l of fc.related_links) if(l.selected) {
      this.selection.push(l);
    }
  }
  
  get clusterOrProcessInSelection() {
    // Return TRUE if current selection contains at least one cluster
    // or process.
    for(const obj of this.selection) {
      if(obj instanceof Cluster || obj instanceof Process) return true;
    }
    return false;
  }

  moveSelection(dx, dy){
    // Move all selected nodes unless cursor was not moved.
    // NOTE: No undo, as moves are incremental; the original positions
    // have been stored on MOUSE DOWN.
    if(dx === 0 && dy === 0) return;
    let minx = 0,
        miny = 0;
    for(const obj of this.selection) {
      if(!(obj instanceof Link || obj instanceof Constraint)) {
        if(obj instanceof Product) {
          obj.movePositionInFocalCluster(dx, dy);
        } else {
          obj.x += dx;
          obj.y += dy;
        }
        minx = Math.min(minx, obj.x - obj.width / 2);
        miny = Math.min(miny, obj.y - obj.height / 2);
      }
    }
    // Record time it takes to redraw so the movement speed can be adapted.
    const
        t0 = Date.now(),
        max_move = Math.round(5 + this.translation_time / 5);
    // Translate entire graph if some elements are above and/or left of
    // the paper edge.
    if(minx < 0 || miny < 0) {
      // NOTE: Limit translation to 5 pixels to prevent "run-away effect".
      this.translateGraph(Math.min(max_move, -minx), Math.min(max_move, -miny));
    } else {
      UI.drawSelection(this);
    }
    // Record the new time it took to redraw.
    this.translation_time = Date.now() - t0;
  }
  
  get topLeftCornerOfSelection() {
    // Return the pair [X coordinate of the edge of the left-most selected node,
    // Y coordinate of the edge of the top-most selected node].
    if(this.selection.length === 0) return [0, 0];
    let minx = VM.PLUS_INFINITY,
        miny = VM.PLUS_INFINITY;
    for(const obj of this.selection) {
      if(!(obj instanceof Link || obj instanceof Constraint)) {
        if(obj instanceof Product) {
          const ppi = this.focal_cluster.indexOfProduct(obj);
          if(ppi >= 0) {
            const pp = this.focal_cluster.product_positions[ppi];
            minx = Math.min(minx, pp.x - obj.width / 2);
            miny = Math.min(miny, pp.y - obj.height / 2);
          }
        } else {
          minx = Math.min(minx, obj.x - obj.width / 2);
          miny = Math.min(miny, obj.y - obj.height / 2);
        }
      }
    }
    return [minx, miny];
  }
  
  get canRenumberSelection() {
    // Selection can be renumbered only if (1) it does not contain clusters,
    // and (2) all selected processes have names that end with a number.
    for(const obj of this.selection) {
      if(obj instanceof Cluster ||
          (obj instanceof Process && !obj.numberContext)) {
        return false;
      }
    }
    return true;
  }
  
  eligibleFromToNodes(type) {
    // Return a list of the nodes of the given type (Process, Product or Data)
    // that are visible in the focal cluster.
    const
        fc = this.focal_cluster,
        el = [];
    if(type === 'Process') {
      el.push(...fc.processes);
    } else {
      for(const pp of fc.product_positions) {
        const p = pp.product;
        if((type === 'Data' && p.is_data) || !p.is_data) el.push(p);
      }
    }
    return el;
  }

  get selectionAsXML() {
    // Return XML for the selected entities, and also for the entities.
    // referenced by expressions for their attributes.
    // NOTE: The name and actor name of the focal cluster are added as
    // attributes of the main node to permit "smart" renaming of
    // entities when PASTE would result in name conflicts.
    if(this.selection.length <= 0) return '';
    const
        fc_name = this.focal_cluster.name,
        fc_actor = this.focal_cluster.actor.name,
        entities = {
          Cluster: [],
          Link: [],
          Constraint: [],
          Note: [],
          Product: [],
          Process: []
        },
        extras = [],
        from_tos = [],
        xml = [],
        extra_xml = [],
        ft_xml = [],
        selc_xml = [],
        selected_xml = [];
    for(const obj of this.selection) {
      entities[obj.type].push(obj);
      if(obj instanceof Cluster) selc_xml.push(
          '<selc name="', xmlEncoded(obj.name),
          '" actor-name="', xmlEncoded(obj.actor.name), '"></selc>');
      selected_xml.push(`<sel>${xmlEncoded(obj.displayName)}</sel>`);
    }
    // Expand (sub)clusters by adding all their model entities to their
    // respective lists.
    for(const c of entities.Cluster) {
      c.clearAllProcesses();
      c.categorizeEntities();
      // All processes and products in (sub)clusters must be copied.
      mergeDistinct(c.all_processes, entities.Process);
      mergeDistinct(c.all_products, entities.Product);
      // Likewise for all related links and constraints
      mergeDistinct(c.related_links, entities.Link);
      mergeDistinct(c.related_constraints, entities.Constraint);
      // NOTE: Add entities referenced by notes within selected clusters
      // to `extras`, but not the XML for these notes, as this is already
      // part of the clusters' XML.
      const an = c.allNotes;
      // Add selected notes as these must also be checked for "extras".
      mergeDistinct(entities.Note, an);
      for(const n of an) {
        mergeDistinct(n.color.referencedEntities, extras);
        for(const f of n.fields) {
          addDistinct(f.object, extras);
        }
      }
    }
    // Only add the XML for notes in the selection.
    for(const n of entities.Note) {
      xml.push(n.asXML);
    }
    for(const p of entities.Product) {
      mergeDistinct(p.lower_bound.referencedEntities, extras);
      mergeDistinct(p.upper_bound.referencedEntities, extras);
      mergeDistinct(p.initial_level.referencedEntities, extras);
      mergeDistinct(p.price.referencedEntities, extras);
      xml.push(p.asXML);
    }
    for(const p of entities.Process) {
      mergeDistinct(p.lower_bound.referencedEntities, extras);
      mergeDistinct(p.upper_bound.referencedEntities, extras);
      mergeDistinct(p.initial_level.referencedEntities, extras);
      mergeDistinct(p.pace_expression.referencedEntities, extras);
      xml.push(p.asXML);
    }
    // Only now add the XML for the selected clusters.
    for(const c of entities.Cluster) {
      xml.push(c.asXML);
    }
    // Add all links that have (implicitly via clusters) been selected.
    for(const l of entities.Link) {
      // NOTE: The FROM and/or TO node need not be selected; if not, put
      // them in a separate list.
      if(entities.Process.indexOf(l.from_node) < 0 &&
          entities.Product.indexOf(l.from_node) < 0) {
        addDistinct(l.from_node, from_tos);
      }
      if(entities.Process.indexOf(l.to_node) < 0 &&
          entities.Product.indexOf(l.to_node) < 0) {
        addDistinct(l.to_node, from_tos);
      }
      mergeDistinct(l.relative_rate.referencedEntities, extras);
      mergeDistinct(l.flow_delay.referencedEntities, extras);
      xml.push(l.asXML);
    }
    for(const c of entities.Constraint) {
      // NOTE: The FROM and/or TO node need not be selected; if not, put
      // them in a separate list.
      if(entities.Process.indexOf(c.from_node) < 0 &&
          entities.Product.indexOf(c.from_node) < 0) {
        addDistinct(c.from_node, from_tos);
      }
      if(entities.Process.indexOf(c.to_node) < 0 &&
          entities.Product.indexOf(c.to_node) < 0) {
        addDistinct(c.to_node, from_tos);
      }
      xml.push(c.asXML);
    }
    for(const p of from_tos) {
      ft_xml.push('<from-to type="', p.type, '" name="', xmlEncoded(p.name));
      if(p instanceof Process) {
        ft_xml.push('" actor-name="', xmlEncoded(p.actor.name));
      } else if(p.is_data) {
        ft_xml.push('" is-data="1');
      }
      ft_xml.push('"></from-to>');
    }
    for(const x of extras) {
      extra_xml.push(x.asXML);
    }
    return ['<copy timestamp="', Date.now(),
        '" model-timestamp="', this.time_created.getTime(),
        '" cluster-name="', xmlEncoded(fc_name),
        '" cluster-actor="', xmlEncoded(fc_actor),
        '"><entities>', xml.join(''),
        '</entities><from-tos>', ft_xml.join(''),
        '</from-tos><extras>', extra_xml.join(''),
        '</extras><selected-clusters>', selc_xml.join(''),
        '</selected-clusters><selection>', selected_xml.join(''),
        '</selection></copy>'].join('');
  }
  
  dropSelectionIntoCluster(c) {
    // Move all selected nodes to cluster `c`.
    // NOTE: The relative position of the selected notes is presserved,
    // but the nodes are positioned to the right of the diagram of `c`
    // with a margin of 50 pixels.
    // NOTE: No dropping if the selection contains one note.
    if(this.selection.length === 1 && this.selection[0] instanceof Note) return;
    const
        space = 50,
        rmx = c.rightMarginX + space,
        tlc = this.topLeftCornerOfSelection;
    let n = 0;
    for(const obj of this.selection) {
      if(obj instanceof Product) {
        const ppi = this.focal_cluster.indexOfProduct(obj);
        if(ppi >= 0) {
          const pp = this.focal_cluster.product_positions[ppi];
          // Add product position for `obj` to `c`.
          if(c.addProductPosition(obj,
              pp.x + rmx - tlc[0], pp.y + space - tlc[1])) {
            // If successful, remove its position from the focal cluster.
            // NOTE: All visible arrows to `obj` will now connect to cluster `c`.
            this.focal_cluster.product_positions.splice(ppi, 1);
            n++;
          }
        }
      } else if(!(obj instanceof Link || obj instanceof Constraint)) {
        obj.setCluster(c);
        obj.x += rmx - tlc[0];
        obj.y += space - tlc[1];
        n++;
      }
      // NOTE: Ignore selected links and constraints, as these will be
      // "taken along" automatically.
    }
    UI.notify(pluralS(n, 'node') + ' moved to cluster ' + c.displayName);
    // Prepare cluster `c` for redrawing.
    c.clearAllProcesses();
    // Clear the selection WITHOUT redrawing the selected entities
    // (as these will no longer be part of the graph).
    this.clearSelection(false);
    // Instead, redraw entire diagram after recomputing the arrows.
    this.focal_cluster.clearAllProcesses();
    UI.drawDiagram(this);
  }
  
  cloneSelection(prefix, actor_name, renumber) {
    // Adds a "clone" to the model for each entity in the selection.
    if(this.selection.length) {
      // Add the prefix symbol ': ' only if the prefix is not blank.
      if(prefix) prefix += UI.PREFIXER;
      // Categorize selected entities and pre-validate their clone name.
      const
          notes = [],
          products = [],
          processes = [],
          clusters = [],
          links = [];
      for(const obj of this.selection) {
        if(obj instanceof Note) {
          notes.push(obj);
        } else if(obj instanceof Link || obj instanceof Constraint) {
          // NOTE: Links and constraints are similar; distinction is made later.
          links.push(obj);
        } else {
          let e = null;
          // Check whether renumbering applies.
          if(actor_name || obj instanceof Cluster ||
              !renumber || !obj.numberContext) {
            // NO? Then check whether prefixed name is already in use.
            let name = prefix + obj.name,
                aname = '';
            if(obj instanceof Process || obj instanceof Cluster) {
              aname = (actor_name ? actor_name : obj.actor.name);
              if(aname && aname !== UI.NO_ACTOR) name += ` (${aname})`;
            }
            e = this.objectByName(name);
          }
          // NOTE: Ignore existing *product* issue when no prefix is defined,
          // as then only processes and clusters will be cloned (for new actor).
          if(e && !(obj instanceof Product && !prefix)) {
            UI.warningEntityExists(e);
            return 'prefix';            
          }
          if(obj instanceof Cluster) {
            if(obj.canBeCloned(prefix, actor_name)) {
              clusters.push(obj);
            } else {
              return 'prefix';
            }
          } else if(obj instanceof Process) {
            processes.push(obj);
          } else if(obj instanceof Product && !e) {
            // NOTE: Do not clone existing products.
            products.push(obj);
          }
        }
      }
      // Construct list of the cloned objects.
      const
        cloned_selection = [],
        node_dict = {};
      // First clone notes.
      for(let nr = 0; nr < notes.length; nr++) {
        const c = this.addNote();
        if(c) {
          c.copyPropertiesFrom(notes[nr], renumber);
          c.x += 100;
          c.y += 100;
          cloned_selection.push(c);
        } else {
          // Warn and exit
          UI.warn('Failed to clone note #' + nr);
          return;
        }
      }
      // Then clone nodes.
      for(const p of processes) {
        const nn = (renumber && !actor_name ? p.nextAvailableNumberName : '');
        let c;
        if(nn) {
          c = this.addProcess(nn, p.actor.name);
        } else {
          const a = (actor_name ? actor_name : p.actor.name);
          c = this.addProcess(prefix + p.name, a);
        }
        if(c) {
          node_dict[p.displayName] = c.displayName;
          c.copyPropertiesFrom(p);
          c.x += 100;
          c.y += 100;
          cloned_selection.push(c);
        } else {
          // Warn and exit.
          UI.warn('Failed to clone process ' + p.displayName);
          return;
        }
      }
      for(const p of products) {
        const
            nn = (renumber && !actor_name ? p.nextAvailableNumberName : ''),
            c = this.addProduct(nn ? nn : prefix + p.name);
        if(c) {
          node_dict[p.displayName] = c.displayName;
          c.copyPropertiesFrom(p);
          // Also add placeholder in the focal cluster.
          this.focal_cluster.addProductPosition(c, c.x + 100, c.y + 100);
          cloned_selection.push(c);
        } else {
          // Warn and exit.
          UI.warn('Failed to clone product ' + p.displayName);
          return;
        }
      }
      // Clone clusters.
      for(const c of clusters) {
        const
            a = (actor_name ? actor_name : c.actor.name),
            cc = this.addCluster(prefix + c.name, a);
        if(cc) {
          cc.cloneFrom(c, prefix, a);
          cc.x += 100;
          cc.y += 100;
          cloned_selection.push(cc);
        } else {
          // Warn and exit.
          UI.warn('Failed to clone cluster ' + c.displayName);
          return;
        }
      }
      // Clone links and constraints -- both are in list `links`.
      for(const l of links) {
        // NOTE: Links and constraints both have FROM and TO nodes.
        let cf = l.from_node,
            ct = l.to_node;
        const
            nf = (node_dict[cf.displayName] ?
                node_dict[cf.displayName] : cf.displayName),
            nt = (node_dict[ct.displayName] ?
                node_dict[ct.displayName] : ct.displayName);
        // If in selection, map FROM node onto cloned node.
        if(processes.indexOf(cf) >= 0) {
          let name = (nf ? nf + (cf.hasActor ? cf.actor.name : '') :
              prefix + cf.name);
          const aname = (actor_name ? actor_name : cf.actor.name);
          if(aname && aname !== UI.NO_ACTOR) name += ` (${aname})`;
          cf = this.objectByName(nf ? nf : name);
        } else if(products.indexOf(cf) >= 0) {
          cf = this.objectByName(nf ? nf : prefix + cf.name);
        }
        // Do likewise for the TO node.
        if(processes.indexOf(ct) >= 0) {
          let name = (nt ? nt + (ct.hasActor ? ct.actor.name : '') :
              prefix + ct.name);
          const aname = (actor_name ? actor_name : ct.actor.name);
          if(aname && aname !== UI.NO_ACTOR) name += ` (${aname})`;
          ct = this.objectByName(nt ? nt : name);
        } else if(products.indexOf(ct) >= 0) {
          ct = this.objectByName(nt ? nt : prefix + ct.name);
        }
        // Only now differentiate between links and constraints
        let c = null;
        if(l instanceof Link) {
          // Add the new link ...
          c = this.addLink(cf, ct);
        } else {
          // ... or the new constraint ...
          c = this.addConstraint(cf, ct);
        }
        if(!c) return;
        // ... but do not add it to the clone list if it already exists .
        if(c !== l) {
          c.copyPropertiesFrom(l);
          cloned_selection.push(c);
        }
      }
      if(cloned_selection.length > 0) {
        // Prepare for redraw
        this.focal_cluster.clearAllProcesses();
        this.focal_cluster.categorizeEntities();
        // Make the clone the new selection (so it can be moved easily).
        this.selectList(cloned_selection);
        UI.drawDiagram(this);
      } else {
        UI.notify('No elements to clone');
      }
    }
    // Empty string indicates: no problems.
    return '';
  }
  
  deleteSelection() {
    // Remove all selected nodes (with their associated links and constraints)
    // and selected links.
    // NOTE: This method implements the DELETE action, and hence should be
    // undoable. The UndoEdit is created by the calling routine; the methods
    // that actually delete model elements append their XML to the XML attribute
    // of this UndoEdit  
    let obj,
        fc = this.focal_cluster;
    // Update the documentation manager (GUI only) if selection contains the
    // current entity.
    if(DOCUMENTATION_MANAGER) DOCUMENTATION_MANAGER.clearEntity(this.selection);
    // First delete links and constraints.
    for(let i = this.selection.length - 1; i >= 0; i--) {
      if(this.selection[i] instanceof Link ||
          this.selection[i] instanceof Constraint) {
        obj = this.selection.splice(i, 1)[0];
        if(obj instanceof Link) {
          this.deleteLink(obj);
        } else {
          this.deleteConstraint(obj);
        }
      }
    }
    // Then delete selected nodes.
    for(let i = this.selection.length - 1; i >= 0; i--) {
      obj = this.selection.splice(i, 1)[0];
      // NOTE: When deleting a selection, this selection has been made in the
      // focal cluster.
      if(obj instanceof Note) {
        fc.deleteNote(obj);
      } else if(obj instanceof Product) {
        fc.deleteProduct(obj);
      } else if(obj instanceof Cluster) {
        this.deleteCluster(obj);
      } else {
        this.deleteNode(obj);
      }
    }
    // Clear the related arrow set (used to minimize link drawing while moving
    // a selection).
    this.selection_related_arrows.length = 0;
    fc.categorizeEntities();
    this.inferIgnoredEntities();
    UI.drawDiagram(this);
  }

  //
  // Methods that delete entities from the model
  //
  
  deleteNode(node) {
    // Delete a node (process or product) and its associated links and constraints
    // from the model.
    // First generate the XML for restoring the node, but add it later to the
    // UndoEdit so that it comes BEFORE the XML of its sub-elements.
    let xml = node.asXML;
    // Prepare for redraw.
    node.cluster.clearAllProcesses();
    // Remove associated links.
    for(let l in this.links) if(this.links.hasOwnProperty(l)) {
      l = this.links[l];
      if(l.from_node == node || l.to_node == node) this.deleteLink(l);
    }
    // Remove associated constraints.
    for(let c in this.constraints) if(this.constraints.hasOwnProperty(c)) {
      c = this.constraints[c];
      if(c.from_node == node || c.to_node == node) this.deleteConstraint(c);
    }
    UI.removeShape(node.shape);
    if(node instanceof Process) {
      // Remove process from the cluster containing it
      const index = node.cluster.processes.indexOf(node);
      if(index >= 0) node.cluster.processes.splice(index, 1);
      delete this.processes[node.identifier];
    } else {
      // Remove product from parameter lists.
      this.removeImport(node);
      this.removeExport(node);
      // Remove product from ALL clusters containing it.
      for(const c of node.productPositionClusters) c.deleteProduct(node);
      delete this.products[node.identifier];
    }
    // Now insert XML for node, so that the constraints will be restored properly.
    UNDO_STACK.addXML(xml);
  }

  deleteLink(link) {
    // Remove link from model.
    // NOTE: Do not allow "semi-black-boxed" links to be removed.
    // Their attributes can be modified, so rate can be set to 0 if needed.
    if(link.displayName.indexOf(UI.BLACK_BOX) >= 0) {
      UI.warn('Black-box links cannot be deleted -- set rate to 0 to disable flow');
      return;
    }
    // First remove link from outputs list of its FROM node.
    const oi = link.from_node.outputs.indexOf(link);
    if(oi >= 0) link.from_node.outputs.splice(oi, 1);
    // Also remove link from inputs list of its TO node.
    const ii = link.to_node.inputs.indexOf(link);
    if(ii >= 0) link.to_node.inputs.splice(ii, 1);
    // Prepare for redraw
    link.from_node.cluster.clearAllProcesses();
    link.to_node.cluster.clearAllProcesses();
    // NOTE: For product nodes, it is possible that their cluster is not the
    // focal cluster; in that case, also prepare the focal cluster.
    if(this.focal_cluster != link.from_node.cluster &&
         this.focal_cluster != link.to_node.cluster) {
      this.focal_cluster.clearAllProcesses();
    }
    // Finally, remove link from the model.
    UNDO_STACK.addXML(link.asXML);
    delete this.links[link.identifier];
    this.cleanUpFeedbackLinks();
  }

  deleteConstraint(constraint) {
    // Remove constraint from model.
    // Prepare for redraw.
    constraint.from_node.cluster.clearAllProcesses();
    constraint.to_node.cluster.clearAllProcesses();
    // NOTE: Clear this global, as Bezier curves move from under the cursor
    // without a mouseout event.
    UI.constraint_under_cursor = null;
    UNDO_STACK.addXML(constraint.asXML);
    UI.removeShape(constraint.shape);
    delete this.constraints[constraint.identifier];
  }

  deleteCluster(c, with_xml=true) {
    // Remove cluster `c` from model.
    // NOTE: Only append the cluster's XML to the UndoEdit if it is the first
    // cluster to be deleted (because this XML contains full XML of all
    // sub-clusters).
    if(with_xml) UNDO_STACK.addXML(c.asXML);
    // Then delete all of its parts (appending their XML to the UndoEdit).
    // NOTE: Delete notes, product positions and subclusters in this cluster
    // WITHOUT appending their XML, as this has already been generated as part
    // of the cluster's XML.
    for(let i = c.notes.length - 1; i >= 0; i--) {
      c.deleteNote(c.notes[i], false);
    }
    for(let i = c.product_positions.length - 1; i >= 0; i--) {
      c.deleteProduct(c.product_positions[i].product, false);
    }
    for(let i = c.processes.length - 1; i >= 0; i--) {
      this.deleteNode(c.processes[i]);
    }
    for(let i = c.sub_clusters.length - 1; i >= 0; i--) {
      // NOTE: Recursive call, but lower level clusters will not output undo-XML.
      this.deleteCluster(c.sub_clusters[i], false); 
    }
    // Remove the cluster from its parent's subcluster list.
    const index = c.cluster.sub_clusters.indexOf(c);
    if(index >= 0) c.cluster.sub_clusters.splice(index, 1);
    UI.removeShape(c.shape);
    // Finally, remove the cluster from the model.
    delete this.clusters[c.identifier];
  }

  cleanUpActors() {
    // Remove actors that do not occur as "owner" of any process, product or
    // cluster, and update the model property `actor_list` accordingly.
    // NOTE: This actor list contains 5-tuples [id, name, round flags (integer),
    // weight (expression string), parameter type (0, 1 or 2)].
    // Compile a list of all actors that are "owner" of a process, product
    // and/or cluster.
    const used = [];
    for(let k in this.processes) if(this.processes.hasOwnProperty(k)) {
      addDistinct(this.processes[k].actor.identifier, used);
    }
    for(let k in this.products) if(this.products.hasOwnProperty(k)) {
      addDistinct(this.products[k].actor.identifier, used);
    }
    for(let k in this.clusters) if(this.clusters.hasOwnProperty(k)) {
      addDistinct(this.clusters[k].actor.identifier, used);
    }
    // Then remove actors that are NOT on this "actors in use" list.
    for(let k in this.actors) if(this.actors.hasOwnProperty(k)) {
      if(used.indexOf(k) < 0) {
        const a = this.actors[k];
        // NOTE: XML for these actors must be appended to the undo because
        // actors have modeler-defined properties.
        UNDO_STACK.addXML(a.asXML);
        this.removeImport(a);
        this.removeExport(a);
        delete this.actors[k];
      }
    }
    // Update the sorted actor list that is used in dialogs.
    this.actor_list.length = 0;
    for(let k in this.actors) if(this.actors.hasOwnProperty(k)) {
      const a = this.actors[k];
      this.actor_list.push([a.identifier, a.displayName, a.round_flags,
        a.weight.text, this.ioType(a)]);
    }
    // NOTE: Sorting will automatically put "(no actor)" at the top since
    // "(" (ASCII 40) comes before "0" (ASCII 48).
    this.actor_list.sort(function(a, b) {return a[0].localeCompare(b[0]);});
  }

  makePredecessorLists() {
    // Compose for each node its lost of predecessor nodes.
    // NOTE: First reset all lists, and unset the `visited` flags of links.
    for(let k in this.processes) if (this.processes.hasOwnProperty(k)) {
      this.processes[k].predecessors.length = 0;
    }
    for(let k in this.products) if (this.products.hasOwnProperty(k)) {
      this.products[k].predecessors.length = 0;
    }
    for(let k in this.links) if(this.links.hasOwnProperty(k)) {
      this.links[k].visited = false;
    }
    // Only then compute the predecessor lists.
    for(let k in this.processes) if (this.processes.hasOwnProperty(k)) {
      this.processes[k].setPredecessors();
    }
    for(let k in this.products) if (this.products.hasOwnProperty(k)) {
      this.products[k].setPredecessors();
    }
  }

  cleanUpFeedbackLinks() {
    // Reset feedback property to FALSE for links that no longer close a loop.
    this.makePredecessorLists();
    for(let l in this.links) if(this.links.hasOwnProperty(l)) {
      l = this.links[l];
      if(l.is_feedback) {
        l.is_feedback = (l.from_node.predecessors.indexOf(l.to_node) >= 0);
      }
    }
  }

  get datasetVariables() {
    // Return list with all ChartVariable objects in this model that
    // reference a regular dataset, i.e., not an equation.
    const vl = [];
    for(const c of this.charts) {
      for(const v of c.variables) {
        if(v.object instanceof Dataset &&
            v.object !== this.equations_dataset) vl.push(v);
      }
    }
    return vl;
  }
  
  get notesWithTags() {
    // Return a list with all notes having tags [[...]] in this model.
    const nl = [];
    for(let k in this.clusters) if(this.clusters.hasOwnProperty(k)) {
      const c = this.clusters[k];
      for(const n of c.notes) if(n.tagList) nl.push(n);
    }
    return nl;
  }
  
  get allExpressions() {
    // Return list of all Expression objects in this model.
    // NOTE: Start with dataset expressions so that when recompiling,
    // their `level-based` property is set before recompiling the
    // other expressions.
    const xl = [];
    for(let k in this.datasets) if(this.datasets.hasOwnProperty(k)) {
      const ds = this.datasets[k];
      // NOTE: Dataset modifier expressions include the equations.
      for(let m in ds.modifiers) if(ds.modifiers.hasOwnProperty(m)) {
        xl.push(ds.modifiers[m].expression);
      }
    }
    for(let k in this.actors) if(this.actors.hasOwnProperty(k)) {
      xl.push(this.actors[k].weight);
    }
    for(let k in this.processes) if(this.processes.hasOwnProperty(k)) {
      const p = this.processes[k];
      xl.push(p.lower_bound, p.upper_bound, p.initial_level, p.pace_expression);
    }
    for(let k in this.products) if(this.products.hasOwnProperty(k)) {
      const p = this.products[k];
      xl.push(p.lower_bound, p.upper_bound, p.initial_level, p.price);
    }
    for(let k in this.clusters) if(this.clusters.hasOwnProperty(k)) {
      for(const n of this.clusters[k].notes) xl.push(n.color);
    }
    for(let k in this.links) if(this.links.hasOwnProperty(k)) {
      const l = this.links[k];
      xl.push(l.relative_rate, l.flow_delay);
    }
    for(let k in this.constraints) if(this.constraints.hasOwnProperty(k)) {
      for(const bl of this.constraints[k].bound_lines) {
        for(const sel of bl.selectors) xl.push(sel.expression);
      }
    }
    return xl;
  }

  replaceEntityInExpressions(en1, en2, notify=true) {
    // Replace entity name `en1` by `en2` in all variables in all expressions
    // (provided that they are not identical).
    if(en1 === en2) return;
    // NOTE: Ignore case and multiple spaces in `en1`, but conserve those in
    // new name `en2` (except for leading and trailing spaces).
    en1 = en1.trim().replace(/\s+/g, ' ').toLowerCase();
    en2 = en2.trim();
    // NOTE: Neither entity name may be empty.
    if(!en1 || !en2) return;
    // NOTE: Use the `rewrite` method of class IOContext; this will keep track
    // of the number of replacements made.
    const ioc = new IOContext();
    // Iterate over all expressions.
    for(const x of this.allExpressions) {
      ioc.rewrite(x, en1, en2);
    }
    // Iterate over all notes in clusters to rename entities in note fields.
    for(let k in this.clusters) if(this.clusters.hasOwnProperty(k)) {
      for(const n of this.clusters[k].notes) n.rewriteFields(en1, en2);
    }
    if(ioc.replace_count) {
      this.variable_count += ioc.replace_count;
      this.expression_count += ioc.expression_count; 
      if(notify) {
        UI.notify(`Renamed ${pluralS(ioc.replace_count, 'variable')} in ` +
            pluralS(ioc.expression_count, 'expression'));
      }
    }
    // Also rename entities in parameters and outcomes of sensitivity analysis.
    for(let i = 0; i < this.sensitivity_parameters.length; i++) {
      const sp = this.sensitivity_parameters[i].split('|');
      if(sp[0].toLowerCase() === en1) {
        sp[0] = en2;
        this.sensitivity_parameters[i] = sp.join('|');
      }
    }
    for(let i = 0; i < this.sensitivity_outcomes.length; i++) {
      const so = this.sensitivity_outcomes[i].split('|');
      if(so[0].toLowerCase() === en1) {
        so[0] = en2;
        this.sensitivity_outcomes[i] = so.join('|');
      }
    }
    // Name was changed, so update controller dialogs to display the new name.
    UI.updateControllerDialogs('CDEFJX');
  }

  replaceAttributeInExpressions(ena, a) {
    // Replace for all occurrences of entity|attribute `ena` the attribute by
    // `a` in all variables in all expressions, and return # replacements made.
    // NOTE: Ignore case and multiple spaces in `en` but not in its attribute
    // or in the new attribute `a` (except for leading and trailing spaces).
    a = a.trim();
    ena = ena.split('|');
    // Double-check that `a` is not empty and `ena` contains a vertical bar.
    if(!a || ena.length < 2) return;
    // Prepare regex to match [entity|attribute] including brackets, but case-
    // tolerant and spacing-tolerant.
    const
        en = escapeRegex(ena[0].trim().replace(/\s+/g, ' ').toLowerCase()),
        at = ena[1].trim(),
        raw = en.replace(/\s/, '\\s+') + '\\s*\\|\\s*' + escapeRegex(at),
        re = new RegExp(String.raw`\[\s*${raw}\s*(\@[^\]]+)?\s*\]`, 'gi');
    // Count replacements made.
    let n = 0;
    // Iterate over all expressions.
    for(const x of this.allExpressions) n += x.replaceAttribute(re, at, a);
    // Also rename attributes in parameters and outcomes of sensitivity analysis.
    let sa_cnt = 0;
    const enat = en + '|' + at;
    for(let i = 0; i < this.sensitivity_parameters.length; i++) {
      const sp = this.sensitivity_parameters[i];
      if(sp.toLowerCase() === enat) {
        this.sensitivity_parameters[i] = sp.split('|')[0] + '|' + a;
        sa_cnt++;
      }
    }
    for(let i = 0; i < this.sensitivity_outcomes.length; i++) {
      const so = this.sensitivity_outcomes[i];
      if(so.toLowerCase() === enat) {
        this.sensitivity_outcomes[i] = so.split('|')[0] + '|' + a;
        sa_cnt++;
      }
    }
    if(sa_cnt > 0) SENSITIVITY_ANALYSIS.updateDialog();
    return n;
  }

  //
  // Methods for loading and saving the model
  //
  
  parseXML(data) {
    // Parse data string into XML tree
//    try {
      // NOTE: Convert %23 back to # (escaped by function saveModel)
      const xml = parseXML(data.replace(/%23/g, '#'));
      // NOTE: loading, not including => make sure that IO context is NULL
      IO_CONTEXT = null;
      this.initFromXML(xml);
      return true;
/*
    } catch(err) {
      // Cursor is set to WAITING when loading starts
      UI.normalCursor();
      UI.alert('Error while parsing model: ' + err);
      return false;
    }
*/
  }

  initFromXML(node) {
    // Initialize a model from the XML tree with `node` as root.
    // NOTE: do NOT reset and initialize basic model properties when
    // *including* a module into the current model.
    // NOTE: Obsolete XML nodes indicate: legacy Linny-R model.
    const legacy_model = (nodeParameterValue(node, 'view-options') +
        nodeParameterValue(node, 'autosave') +
        nodeParameterValue(node, 'look-ahead') +
        nodeParameterValue(node, 'save-series') +
        nodeParameterValue(node, 'show-lp') +
        nodeParameterValue(node, 'optional-slack')).length > 0;
    // Flag to set when legacy time series data are added.
    this.legacy_datasets = false;
    if(!IO_CONTEXT) {
      this.reset();
      this.next_process_number = safeStrToInt(
          nodeParameterValue(node, 'next-process-number'));
      this.next_product_number = safeStrToInt(
          nodeParameterValue(node, 'next-product-number'));
      this.last_zoom_factor = safeStrToFloat(
          nodeParameterValue(node, 'zoom'), 1);
      this.rounds = safeStrToInt(nodeParameterValue(node, 'rounds'), 1);
      this.actors[UI.nameToID(UI.NO_ACTOR)].round_flags = safeStrToInt(
          nodeParameterValue(node, 'no-actor-round-flags'));
      this.encrypt = nodeParameterValue(node, 'encrypt') === '1';
      this.decimal_comma = nodeParameterValue(node, 'decimal-comma') === '1';
      this.align_to_grid = nodeParameterValue(node, 'align-to-grid') === '1';
      this.with_power_flow = nodeParameterValue(node, 'power-flow') === '1';
      this.ignore_grid_capacity = nodeParameterValue(node, 'ignore-grid-capacity') === '1';
      this.ignore_KVL = nodeParameterValue(node, 'ignore-KVL') === '1';
      this.ignore_power_losses = nodeParameterValue(node, 'ignore-power-losses') === '1';
      this.infer_cost_prices = nodeParameterValue(node, 'cost-prices') === '1';
      this.ignore_negative_flows = nodeParameterValue(node, 'negative-flows') === '1';
      this.report_results = nodeParameterValue(node, 'report-results') === '1';
      this.show_block_arrows = nodeParameterValue(node, 'block-arrows') === '1';
      // NOTE: Diagnosis option should default to TRUE unless *set* to FALSE.
      this.always_diagnose = nodeParameterValue(node, 'diagnose') !== '0';
      this.show_notices = nodeParameterValue(node, 'show-notices') === '1';
      this.name = xmlDecoded(nodeContentByTag(node, 'name'));
      this.author = xmlDecoded(nodeContentByTag(node, 'author'));
      this.comments = xmlDecoded(nodeContentByTag(node, 'notes'));
      this.last_modified = new Date(
          xmlDecoded(nodeContentByTag(node, 'last-saved')));
      this.version = xmlDecoded(nodeContentByTag(node, 'version'));
      this.timeout_period = Math.max(0,
          safeStrToInt(nodeContentByTag(node, 'timeout-period')));
      this.preferred_solver = xmlDecoded(
          nodeContentByTag(node, 'preferred-solver')); 
      this.integer_tolerance = safeStrToFloat(
          nodeContentByTag(node, 'integer-tolerance'), 5e-7);
      this.MIP_gap = safeStrToFloat(nodeContentByTag(node, 'mip-gap'), 1e-4);
      // Legacy models have tag "optimization-period" instead of "block-length".
      const bl_str = nodeContentByTag(node, 'block-length') ||
          nodeContentByTag(node, 'optimization-period'); 
      this.block_length = Math.max(1, safeStrToInt(node, bl_str));
      this.start_period = Math.max(1,
          safeStrToInt(nodeContentByTag(node, 'start-period')));
      this.end_period = Math.max(1,
          safeStrToInt(nodeContentByTag(node, 'end-period')));
      this.look_ahead = Math.max(0,
          safeStrToInt(nodeContentByTag(node, 'look-ahead-period')));
      this.grid_pixels = Math.max(10,
          safeStrToInt(nodeContentByTag(node, 'grid-pixels')));
      this.round_sequence = nodeContentByTag(node, 'round-sequence');
      this.currency_unit = xmlDecoded(nodeContentByTag(node, 'currency-unit'));
      if(!this.currency_unit) this.currency_unit = CONFIGURATION.default_currency_unit;
      this.time_scale = safeStrToFloat(nodeContentByTag(node, 'time-scale'), 1);
      this.time_unit = nodeContentByTag(node, 'time-unit');
      if(!(this.time_unit in VM.time_unit_values)) {
        this.time_unit = CONFIGURATION.default_time_unit;
      }
      this.default_unit = xmlDecoded(
          nodeContentByTag(node, 'default-scale-unit'));
      if(!this.default_unit) this.default_unit = CONFIGURATION.default_scale_unit;
    } // END IF *not* including a model

    // Declare some local variables that will be used a lot.
    let name,
        actor,
        fn,
        tn,
        n = childNodeByTag(node, 'scaleunits');
    // Scale units are not "entities", and can be included "as is".
    if(n) {
      for(const c of n.childNodes) if(c.nodeName === 'scaleunit') {
        this.addScaleUnit(xmlDecoded(nodeContentByTag(c, 'name')),
            nodeContentByTag(c, 'scalar'),
            xmlDecoded(nodeContentByTag(c, 'base-unit')));
      }
    }
    // Power grids are not "entities", and can be included "as is".
    n = childNodeByTag(node, 'powergrids');
    if(n) {
      for(const c of n.childNodes) if(c.nodeName === 'grid') {
        this.addPowerGrid(nodeContentByTag(c, 'id'), c);
      }
    }
    // When including a model, actors may be bound to an existing actor.
    n = childNodeByTag(node, 'actors');
    if(n) {
      for(const c of n.childNodes) if(c.nodeName === 'actor') {
        name = xmlDecoded(nodeContentByTag(c, 'name'));
        if(IO_CONTEXT) name = IO_CONTEXT.actualName(name);
        this.addActor(name, c);
      }
    }
    // When including a model, processes MUST be prefixed.
    n = childNodeByTag(node, 'processes');
    if(n) {
      for(const c of n.childNodes) if(c.nodeName === 'process') {
        name = xmlDecoded(nodeContentByTag(c, 'name'));
        actor = xmlDecoded(nodeContentByTag(c, 'owner'));
        if(IO_CONTEXT) {
          actor = IO_CONTEXT.actualName(actor);
          name = IO_CONTEXT.actualName(name, actor);
        }
        this.addProcess(name, actor, c);
      }
    }
    // When including a model, products may be bound to an existing product.
    n = childNodeByTag(node, 'products');
    if(n) {
      for(const c of n.childNodes) if(c.nodeName === 'product') {
        name = xmlDecoded(nodeContentByTag(c, 'name'));
        if(IO_CONTEXT) name = IO_CONTEXT.actualName(name);
        this.addProduct(name, c);
      }
    }
    // When including a model, link nodes may be bound to existing nodes.
    n = childNodeByTag(node, 'links');
    if(n) {
      for(const c of n.childNodes) if(c.nodeName === 'link') {
        name = xmlDecoded(nodeContentByTag(c, 'from-name'));
        actor = xmlDecoded(nodeContentByTag(c, 'from-owner'));
        if(IO_CONTEXT) {
          actor = IO_CONTEXT.actualName(actor);
          name = IO_CONTEXT.actualName(name, actor);
        }
        if(actor != UI.NO_ACTOR) name += ` (${actor})`;
        fn = this.nodeBoxByID(UI.nameToID(name));
        if(fn) {
          name = xmlDecoded(nodeContentByTag(c, 'to-name'));
          actor = xmlDecoded(nodeContentByTag(c, 'to-owner'));
          if(IO_CONTEXT) {
            actor = IO_CONTEXT.actualName(actor);
            name = IO_CONTEXT.actualName(name, actor);
          }
          if(actor != UI.NO_ACTOR) name += ` (${actor})`;
          tn = this.nodeBoxByID(UI.nameToID(name));
          if(tn) this.addLink(fn, tn, c);
        }
      }
    }
    // When including a model, constraint nodes may be bound to existing nodes.
    n = childNodeByTag(node, 'constraints');
    if(n) {
      for(const c of n.childNodes) if(c.nodeName === 'constraint') {
        name = xmlDecoded(nodeContentByTag(c, 'from-name'));
        actor = xmlDecoded(nodeContentByTag(c, 'from-owner'));
        if(IO_CONTEXT) {
          actor = IO_CONTEXT.actualName(actor);
          name = IO_CONTEXT.actualName(name, actor);
        }
        if(actor != UI.NO_ACTOR) name += ` (${actor})`;
        fn = this.nodeBoxByID(UI.nameToID(name));
        if(fn) {
          name = xmlDecoded(nodeContentByTag(c, 'to-name'));
          actor = xmlDecoded(nodeContentByTag(c, 'to-owner'));
          if(IO_CONTEXT) {
            actor = IO_CONTEXT.actualName(actor);
            name = IO_CONTEXT.actualName(name, actor);
          }
          if(actor != UI.NO_ACTOR) name += ` (${actor})`;
          tn = this.nodeBoxByID(UI.nameToID(name));
          if(tn) this.addConstraint(fn, tn, c);
        }
      }
    }
    n = childNodeByTag(node, 'clusters');
    if(n) {
      for(const c of n.childNodes) if(c.nodeName === 'cluster') {
        name = xmlDecoded(nodeContentByTag(c, 'name'));
        actor = xmlDecoded(nodeContentByTag(c, 'owner'));
        // When including a model, clusters MUST be prefixed
        if(IO_CONTEXT) {
          actor = IO_CONTEXT.actualName(actor);
          // NOTE: actualName will rename the top cluster of an included
          // model to just the prefix
          name = IO_CONTEXT.actualName(name, actor);
        }
        this.addCluster(name, actor, c);
      }
    }
    // Clear the default (empty) equations dataset, or it will block adding it
    if(!IO_CONTEXT) {
      if(!this.legacy_datasets) this.datasets = {};
      this.equations_dataset = null;
    }
    // NOTE: keep track of datasets that load from URL or file
    this.loading_datasets.length = 0;
    this.max_time_to_load = 0;
    n = childNodeByTag(node, 'datasets');
    if(n) {
      for(const c of n.childNodes) if(c.nodeName === 'dataset') {
        name = xmlDecoded(nodeContentByTag(c, 'name'));
        // NOTE: when including a module, dataset parameters may be bound to
        // existing datasets, but the equations dataset is a special case:
        // a model has only ONE equations dataset, so for imported equations 
        // the *modifiers* must be prefixed. This is implemented by passing
        // the IO context as third argument to the addModifier method, which
        // will then add the module prefix to the selector
        if(IO_CONTEXT) {
          if(name === UI.EQUATIONS_DATASET_NAME) {
            const mn = childNodeByTag(c, 'modifiers');
            if(mn) {
              for(const cc of mn.childNodes) if(cc.nodeName === 'modifier') {
                this.equations_dataset.addModifier(
                    xmlDecoded(nodeContentByTag(cc, 'selector')),
                    cc, IO_CONTEXT);
              }
            }              
          } else {
            name = IO_CONTEXT.actualName(name);
          }
        }
        this.addDataset(name, c);
      }
    }
    // Create equations dataset if not defined yet (legacy models < 0.9x50)
    this.equations_dataset = this.objectByName(UI.EQUATIONS_DATASET_NAME);
    if(!this.equations_dataset){
      this.equations_dataset = this.addDataset(UI.EQUATIONS_DATASET_NAME);
    }
    // NOTE: When including a model, charts MUST be prefixed.
    n = childNodeByTag(node, 'charts');
    if(n) {
      for(const c of n.childNodes) if(c.nodeName === 'chart') {
        name = xmlDecoded(nodeContentByTag(c, 'title'));
        if(IO_CONTEXT) {
          // NOTE: Only include charts with one or more variables.
          const vn = childNodeByTag(c, 'variables');
          if(vn && vn.childNodes && vn.childNodes.length > 0) {
            name = IO_CONTEXT.actualName(name);
            this.addChart(name, c);
          }
        } else {
          this.addChart(name, c);
        }
      }
    }
    // Infer selector order list by splitting text on any white space.
    this.selector_order_string = xmlDecoded(nodeContentByTag(node,
        'selector-order'));
    this.selector_order_list = this.selector_order_string.trim().split(/\s+/);
    // Infer dimensions of experimental design space.
    this.inferDimensions();
    // NOTE: When including a model, IGNORE sensitivity analysis, experiments
    // and import/export definitions, and do NOT perform any further
    // initialization operations.
    if(!IO_CONTEXT) {
      this.base_case_selectors = xmlDecoded(
          nodeContentByTag(node, 'base-case-selectors'));
      n = childNodeByTag(node, 'sensitivity-parameters');
      if(n) {
        for(const c of n.childNodes) if(c.nodeName === 'sa-parameter') {
          this.sensitivity_parameters.push(xmlDecoded(nodeContent(c)));
        }
      }
      n = childNodeByTag(node, 'sensitivity-outcomes');
      if(n) {
        for(const c of n.childNodes) if(c.nodeName === 'sa-outcome') {
          this.sensitivity_outcomes.push(xmlDecoded(nodeContent(c)));
        }
      }
      this.sensitivity_delta = safeStrToFloat(
          nodeContentByTag(node, 'sensitivity-delta'));
      n = childNodeByTag(node, 'sensitivity-runs');
      if(n) {
        // NOTE: Use a "dummy experiment object" as parent for SA runs.
        const dummy = {title: SENSITIVITY_ANALYSIS.experiment_title};
        let r = 0;
        for(const c of n.childNodes) if(c.nodeName === 'experiment-run') {
          const xr = new ExperimentRun(dummy, r);
          xr.initFromXML(c);
          this.sensitivity_runs.push(xr);
          r++;
        }
      }
      n = childNodeByTag(node, 'experiments');
      if(n) {
        for(const c of n.childNodes) if(c.nodeName === 'experiment') {
          this.addExperiment(xmlDecoded(nodeContentByTag(c, 'title')), c);
        }
      }
      n = childNodeByTag(node, 'imports');
      if(n) {
        for(const c of n.childNodes) if(c.nodeName === 'import') this.addImport(c);
      }
      n = childNodeByTag(node, 'exports');
      if(n) {
        for(const c of n.childNodes) if(c.nodeName === 'export') this.addExport(c);
      }
      // Add the default chart (will add it only if absent).
      this.addChart(CHART_MANAGER.new_chart_title);
      // Infer dimensions of experimental design space.
      this.inferDimensions();
      // Set the current time step (if specified).
      const s = nodeParameterValue(node, 'current');
      if(s) {
        this.current_time_step = Math.min(this.end_period,
            Math.max(this.start_period, safeStrToInt(s)));
      } else {
        this.current_time_step = 0;
      }
      this.inferIgnoredEntities();
      this.focal_cluster = this.top_cluster;
      // NOTE: Links in legacy Linny-R models by default have 100% share-of-cost;
      // to minimize conversion effort, set SoC for SINGLE links OUT of processes
      // to 100%.
      if(legacy_model) {
        for(let k in this.links) if(this.links.hasOwnProperty(k)) {
          const l = this.links[k];
          // NOTE: Preserve non-zero SoC values, as these have been specified
          // by the modeler.
          if(l.from_node instanceof Process &&
              l.from_node.outputs.length === 1 && l.share_of_cost === 0) {
            l.share_of_cost = 1;
          }
        }
      }
    }
    // Recompile expressions so that level-based properties are set.
    // NOTE: When a series of modules is included, skip this step until
    // the last inclusion.
    if(!IO_CONTEXT || IO_CONTEXT.recompile) this.compileExpressions();
  }

  get asXML() {
    let p = [' next-process-number="', this.next_process_number,
        '" next-product-number="', this.next_product_number,
        '" zoom="', this.last_zoom_factor,
        '" current="', this.current_time_step,
        '" rounds="', this.rounds,
        '" no-actor-round-flags="', this.actors[UI.nameToID(UI.NO_ACTOR)].round_flags,
        // NOTE: Add the diagnosis option *explicitly* to differentiate
        // between older models saved *without* this option, and newer
        // models having this option switched off. 
        '" diagnose="', (this.always_diagnose ? '1' : '0'),
        '"'].join('');
    if(this.encrypt) p += ' encrypt="1"';
    if(this.decimal_comma) p += ' decimal-comma="1"';
    if(this.align_to_grid) p += ' align-to-grid="1"';
    if(this.with_power_flow) p += ' power-flow="1"';
    if(this.ignore_grid_capacity) p += ' ignore-grid-capacity="1"';
    if(this.ignore_KVL) p += ' ignore-KVL="1"';
    if(this.ignore_power_losses) p += ' ignore-power-losses="1"';
    if(this.infer_cost_prices) p += ' cost-prices="1"';
    if(this.ignore_negative_flows) p += ' negative-flows="1"';
    if(this.report_results) p += ' report-results="1"';
    if(this.show_block_arrows) p += ' block-arrows="1"';
    if(this.show_notices) p += ' show-notices="1"';
    let xml = this.xml_header + ['<model', p, '><name>',  xmlEncoded(this.name),
        '</name><author>', xmlEncoded(this.author),
        '</author><notes>', xmlEncoded(this.comments),
        '</notes><version>',  xmlEncoded(LINNY_R_VERSION),
        '</version><last-saved>',  xmlEncoded(this.last_modified.toString()),
        '</last-saved><time-scale>', this.time_scale,
        '</time-scale><time-unit>', this.time_unit,
        '</time-unit><default-scale-unit>', xmlEncoded(this.default_unit),
        '</default-scale-unit><currency-unit>', xmlEncoded(this.currency_unit),
        '</currency-unit><grid-pixels>', this.grid_pixels,
        '</grid-pixels><timeout-period>', this.timeout_period,
        '</timeout-period><preferred-solver>', xmlEncoded(this.preferred_solver), 
        '</preferred-solver><integer-tolerance>', this.integer_tolerance,
        '</integer-tolerance><mip-gap>', this.MIP_gap,
        '</mip-gap><block-length>', this.block_length,
        '</block-length><start-period>', this.start_period,
        '</start-period><end-period>', this.end_period,
        '</end-period><look-ahead-period>', this.look_ahead,
        '</look-ahead-period><round-sequence>', this.round_sequence,
        '</round-sequence><scaleunits>'].join('');
    let obj;
    for(obj in this.scale_units) if(this.scale_units.hasOwnProperty(obj)) {
      xml += this.scale_units[obj].asXML;
    }
    xml += '</scaleunits><powergrids>';
    for(obj in this.power_grids) if(this.power_grids.hasOwnProperty(obj)) {
      xml += this.power_grids[obj].asXML;
    }
    xml += '</powergrids><actors>';
    for(obj in this.actors) {
      // NOTE: Do not to save "(no actor)".
      if(this.actors.hasOwnProperty(obj) && obj != UI.nameToID(UI.NO_ACTOR)) {
        xml += this.actors[obj].asXML;
      }
    }
    xml += '</actors><processes>';
    for(obj in this.processes) {
      if(this.processes.hasOwnProperty(obj)) xml += this.processes[obj].asXML;
    }
    xml +='</processes><products>';
    for(obj in this.products) {
      if(this.products.hasOwnProperty(obj)) xml += this.products[obj].asXML;
    }
    xml += '</products><links>';
    for(obj in this.links) {
      if(this.links.hasOwnProperty(obj)) xml += this.links[obj].asXML;
    }
    xml += '</links><constraints>';
    for(obj in this.constraints) {
      if(this.constraints.hasOwnProperty(obj)) {
        xml += this.constraints[obj].asXML;
      }
    }
    // NOTE: Cluster XML defines its own subclusters, and the model has
    // ONE top cluster that cannot be "black-boxed".
    xml += '</constraints><clusters>' + this.top_cluster.asXML +
        '</clusters><datasets>';
    for(obj in this.datasets) {
      if(this.datasets.hasOwnProperty(obj)) xml += this.datasets[obj].asXML;
    }
    xml += '</datasets><charts>';
    for(const c of this.charts) xml += c.asXML;
    xml += '</charts><selector-order>' +
        xmlEncoded(this.selector_order_string) + '</selector-order>';
    // NOTE: When "black-boxing", SA and experiments are not stored.
    if(!this.black_box) {
      xml += '<base-case-selectors>' +
          xmlEncoded(this.base_case_selectors) +
          '</base-case-selectors><sensitivity-parameters>';
      for(const sp of this.sensitivity_parameters) {
        xml += '<sa-parameter>' + xmlEncoded(sp) + '</sa-parameter>';
      }
      xml += '</sensitivity-parameters><sensitivity-outcomes>';
      for(const so of this.sensitivity_outcomes) {
        xml += '<sa-outcome>' + xmlEncoded(so) + '</sa-outcome>';
      }
      xml += '</sensitivity-outcomes><sensitivity-delta>' +
        this.sensitivity_delta + '</sensitivity-delta><sensitivity-runs>';
      for(const r of this.sensitivity_runs) xml += r.asXML;
      xml += '</sensitivity-runs><experiments>';
      for(const x of this.experiments) xml += x.asXML;
      xml += '</experiments>';
    }
    // NOTE: Always store module parameters.
    xml += '<imports>';
    for(const io of this.imports) xml += io.asXML;
    xml += '</imports><exports>';
    for(const io of this.exports) xml += io.asXML;
    return xml + '</exports></model>';
  }
  
  get asBlackBoxXML() {
    // Returns model as XML with abstract names for all "black-boxed" entities.
    this.black_box = true;
    this.inferBlackBoxEntities();
    const xml = this.asXML;
    this.black_box = false;
    return xml;
  }
  
  asEncryptedXML(enc) {
    return this.xml_header + [
        '<model latch="', enc.latch, '"><notes>',
        xmlEncoded(this.comments.replace(/#/g, '%23')),
        '</notes><version>', xmlEncoded(LINNY_R_VERSION),
        '</version><content>', enc.encryption,
        '</content></model>'].join('');
  }

  get outputData() {
    // Returns model results [data, statistics] in tab-separated format.
    const
        vbls = [],
        names = [],
        scale_re = /\s+\(x[0-9\.\,]+\)$/;
    // First create list of distinct variables used in charts.
    // NOTE: Also include those that are not checked as "visible".
    for(const c of this.charts) {
      for(const v of c.variables) {
        let vn = v.displayName;
        // If variable is scaled, do not include it as such, but include
        // a new unscaled chart variable.
        if(vn.match(scale_re)) {
          vn = vn.replace(scale_re, '');
          // Add only if (now unscaled) variable has not been added already.
          if(names.indexOf(vn) < 0) {
            // NOTE: Chart variable object is used ony as a dummy, so NULL
            // can be used as its "owner chart". 
            const cv = new ChartVariable(null);
            cv.setProperties(v.object, v.attribute, false, '#000000');
            vbls.push(cv);
            names.push(vn);
          }
        } else if(names.indexOf(vn) < 0) {
          // Keep track of the dataset and dataset modifier variables,
          // so they will not be added in the next FOR loop.
          vbls.push(v);
          names.push(vn);
        }
      }
    }
    // Add new variables for each outcome dataset and each equation that
    // is not a chart variable.
    for(let id in this.datasets) if(this.datasets.hasOwnProperty(id)) {
      const
          ds = this.datasets[id],
          eq = (ds === this.equations_dataset);
      if(ds.outcome || eq) {
        for(let ms in ds.modifiers) if(ds.modifiers.hasOwnProperty(ms)) {
          const
              dm = ds.modifiers[ms],
              n = dm.displayName;
          // Do not add if already in the list, or equation is not outcome.
          if(names.indexOf(n) < 0 && (!eq || dm.outcome_equation)) {
            // Here, too, NULL can be used as "owner chart". 
            const cv = new ChartVariable(null);
            // NOTE: For equations, the object is the dataset modifier.
            cv.setProperties(eq ? dm : ds, dm.selector, false, '#000000');
            vbls.push(cv);
          }
        }
      }
    }
    // Sort variables by their name.
    vbls.sort((a, b) => UI.compareFullNames(a.displayName, b.displayName));
    // Create a new chart as dummy, so without adding it to this model.
    const
        c = new Chart('__d_u_m_m_y__c_h_a_r_t__'),
        wcdm = [];
    for(const v of vbls) {
      // NOTE: Prevent adding wildcard dataset modifiers more than once.
      if(wcdm.indexOf(v.object) < 0) {
        if(v.object instanceof DatasetModifier &&
            v.object.selector.indexOf('??') >= 0) wcdm.push(v.object);
        c.addVariable(v.object.displayName, v.attribute);
      }
    }
    // NOTE: Call `draw` with FALSE to prevent display in the chart manager.
    c.draw(false);
    // After drawing, all variables and their statistics have been computed.
    return [c.dataAsString, c.statisticsAsString];
  }
    
  get dictOfAllSelectors() {
    // Returns "dictionary" of all dataset modifier selectors like so:
    // {selector_1: [list of datasets], ...}
    const ds_dict = {};
    for(let k in this.datasets) if(this.datasets.hasOwnProperty(k)) {
      const ds = this.datasets[k];
      // NOTE: Ignore selectors of the equations dataset.
      if(ds !== this.equations_dataset) {
        for(let m in ds.modifiers) if(ds.modifiers.hasOwnProperty(m)) {
          const s = ds.modifiers[m].selector;
          if(s in ds_dict) {
            ds_dict[s].push(ds);
          } else {
            ds_dict[s] = [ds];
          }
        }
      }
    }
    return ds_dict;
  }

  get listOfAllComments() {
    const sl = [];
    sl.push('_____MODEL: ' + this.name);
    sl.push('<strong>Author:</strong> ' + this.author);
    sl.push(this.comments);
    let obj;
    sl.push('_____Actors');
    for(obj in this.actors) {
      if(this.actors.hasOwnProperty(obj)) {
        sl.push(this.actors[obj].displayName, this.actors[obj].comments);
      }
    }
    sl.push('_____Processes');
    for(obj in this.processes) {
      if(this.processes.hasOwnProperty(obj) && !obj.startsWith(UI.BLACK_BOX)) {
        sl.push(this.processes[obj].displayName, this.processes[obj].comments);
      }
    }
    sl.push('_____Products');
    for(obj in this.products) {
      if(this.products.hasOwnProperty(obj) && !obj.startsWith(UI.BLACK_BOX)) {
        sl.push(this.products[obj].displayName, this.products[obj].comments);
      }
    }
    sl.push('_____Links');
    for(obj in this.links) {
      if(this.links.hasOwnProperty(obj)) {
        sl.push(this.links[obj].displayName, this.links[obj].comments);
      }
    }
    sl.push('_____Constraints');
    for(obj in this.constraints) {
      if(this.constraints.hasOwnProperty(obj)) {
        sl.push(this.constraints[obj].displayName, this.constraints[obj].comments);
      }
    }
    sl.push('_____Datasets');
    for(const k of Object.keys(this.datasets)) {
      if(!k.startsWith(UI.BLACK_BOX) && k !== UI.EQUATIONS_DATASET_ID) {
        const ds = this.datasets[k]; 
        sl.push(ds.displayName, ds.comments);
        const keys = Object.keys(ds.modifiers).sort(compareSelectors);
        if(keys.length) {
          for(const k of keys) {
            const m = ds.modifiers[k];
            // NOTE: The trailing arrow signals the Documentation manager that
            // this (name, documentation) pair is a dataset modifier.
            sl.push(`${m.selector}&nbsp;&rarr;` , m.expression.text);
          }
        }
      }
    }
    const keys = Object.keys(this.equations_dataset.modifiers).sort(); 
    sl.push('_____Equations');
    for(const k of keys) {
      const m = this.equations_dataset.modifiers[k];
      if(!m.selector.startsWith(':')) {
        sl.push(m.displayName, '`' + m.expression.text + '`\n');
      }
    }
    sl.push('_____Methods');
    for(const k of keys) {
      const m = this.equations_dataset.modifiers[k];
      if(m.selector.startsWith(':')) {
        let markup = '\n\nDoes not apply to any entity.';
        if(m.expression.eligible_prefixes) {
          const el = Object.keys(m.expression.eligible_prefixes)
              .sort(compareSelectors);
          if(el.length > 0) markup = '\n\nApplies to ' +
              pluralS(el.length, 'prefixed entity group') +
              ':\n- ' + el.join('\n- ');
        }
        sl.push(m.displayName, '`' + m.expression.text + '`' + markup);
      }
    }
    sl.push('_____Charts');
    for(const c of this.charts) sl.push(c.title, c.comments);
    sl.push('_____Experiments');
    for(const x of this.experiments) sl.push(x.title, x.comments);
    return sl;
  }
  
  /* METHODS RELATED TO EXPRESSIONS */
  
  cleanVector(v, initial, other=VM.NOT_COMPUTED) {
    // Set an array to [0, ..., run length] of numbers initialized as
    // "not computed" to ensure that they will be evaluated "lazily".
    // NOTES:
    // (1) The first element (0) corresponds to t = 0, i.e., the model
    //     time step just prior to the time step defined by start_period.
    // (2) All vectors must be initialized with an appropriate value for
    //     element 0.
    // (3) `other` specifies value for t = 1 and beyond if vector is
    //     static and has to to be initialized to a constant (typically 0).
    v.length = this.runLength + 1;
    v.fill(other);
    v[0] = initial;
  }
  
  resetExpressions() {
    // Create a new vector for all expression attributes of all model
    // entities, using the appropriate default value.

    // Ensure that the equations dataset must have default value UNDEFINED
    // so the modeler is warned when a wildcard equation fails to obtain
    // a valid wildcard number. 
    this.equations_dataset.default_value = VM.UNDEFINED;
    for(let k in this.actors) if(this.actors.hasOwnProperty(k)) {
      const a = this.actors[k];
      // Default weight = 1.
      a.weight.reset(1);
      // NOTE: Actor cash flows cumulate as sum of CF of "owned" processes.
      this.cleanVector(a.cash_flow, 0, 0);
      this.cleanVector(a.cash_in, 0, 0);
      this.cleanVector(a.cash_out, 0, 0);
    }
    for(let k in this.clusters) if(this.clusters.hasOwnProperty(k)) {
      const c = this.clusters[k];
      // NOTE: Cluster cash flows cumulate as sum of CF of child processes.
      this.cleanVector(c.cash_flow, 0, 0);
      this.cleanVector(c.cash_in, 0, 0);
      this.cleanVector(c.cash_out, 0, 0);
      // NOTE: Note fields also must be reset.
      c.resetNoteFields();
    }
    for(let k in this.processes) if(this.processes.hasOwnProperty(k)) {
      const p = this.processes[k];
      // Defaults for processes: LB = 0, UB = +INF, L = initial level.
      p.lower_bound.reset(0);
      p.upper_bound.reset(VM.PLUS_INFINITY);
      p.initial_level.reset(0);
      p.pace_expression.reset(1);
      // NOTE: Immediately calculate pace (*static* integer value >= 1).
      p.pace = Math.max(1, Math.floor(p.pace_expression.result(1)));
      this.cleanVector(p.level, p.initial_level.result(1));
      this.cleanVector(p.cost_price, VM.UNDEFINED);
      this.cleanVector(p.cash_flow, 0, 0);
      this.cleanVector(p.marginal_cash_flow, 0, 0);
      this.cleanVector(p.cash_in, 0, 0);
      this.cleanVector(p.cash_out, 0, 0);
      // NOTE: `start_ups` is a list of time steps when start-up occurred.
      p.start_ups.length = 0;
      // NOTE: `b_peak_inc` records the peak increase for each block,
      // so at t=0 (block *before* block #1) this is the initial level.
      p.b_peak_inc = [p.level[0]];
      // `la_peak_inc` records the additional peak increase in the
      // look-ahead period.
      p.la_peak_inc = [p.level[0]];
      // b_peak[b] records peak level value up to and including block b.
      p.b_peak = [p.level[0]];      
    }
    for(let k in this.products) if(this.products.hasOwnProperty(k)) {
      const p = this.products[k];
      // Empty lower bound string indicates LB = 0 unless p is a source.
      p.lower_bound.reset(p.isSourceNode ? VM.MINUS_INFINITY : 0);
      // Empty upper bound string for product (!) indicates UB = 0
      // unless p is a sink.
      p.upper_bound.reset(p.isSinkNode ? VM.PLUS_INFINITY : 0);
      // Price defaults to 0.
      p.price.reset(0);
      p.initial_level.reset(0);
      // Level defaults to initial level.
      this.cleanVector(p.level, p.initial_level.result(1));
      this.cleanVector(p.cost_price, VM.UNDEFINED);
      this.cleanVector(p.highest_cost_price, VM.UNDEFINED);
      if(p.is_buffer) this.cleanVector(p.stock_price, VM.UNDEFINED);
      p.start_ups.length = 0;
      // NOTE: Peak increase also applies to products.
      p.b_peak_inc = [p.level[0]];
      p.la_peak_inc = [p.level[0]];
      p.b_peak = [p.level[0]];      
    }
    for(let k in this.links) if(this.links.hasOwnProperty(k)) {
      const l = this.links[k];
      l.relative_rate.reset(1);
      l.flow_delay.reset(0);
      // NOTE: Initial value (for t=0) of vectors is special!
      let p;
      if(l.to_node instanceof Process) {
        p = l.to_node.initial_level.result(1);
      } else {
        // NOTE: Works also if FROM node is a product.
        p = l.from_node.initial_level.result(1);
        // Link multiplier also matters!
        if(l.to_node.is_data && l.multiplier > 0) {
          if(l.multiplier === VM.LM_ZERO) {
            p = (p === 0 ? 1 : 0);
          } else if(l.multiplier === VM.LM_POSITIVE) {
            p = (p > 0 ? 1 : 0);
          } else if(l.multiplier === VM.LM_THROUGHPUT) {
            // Link rates default to 1, so take # links in as throughput.
            p *= l.from_node.inputs.length;
          } else if(l.multiplier === VM.LM_STARTUP ||
              l.multiplier === VM.LM_SHUTDOWN ||
              l.multiplier === VM.LM_FIRST_COMMIT) {
            p = 0;
          } else if(l.multiplier === VM.LM_SPINNING_RESERVE) {
            p = (p === 0 ? 0 : VM.PLUS_INFINITY);
          }
          // Other multipliers: p equals the initial FROM node level.
        }
      }
      this.cleanVector(l.actual_flow, p * l.relative_rate.result(0));
    }
    for(let k in this.constraints) if(this.constraints.hasOwnProperty(k)) {
      const c = this.constraints[k];
      for(const bl of c.bound_lines) {
        for(const sel of bl.selectors) sel.expression.reset(0);
      }
    }
    for(let k in this.datasets) if(this.datasets.hasOwnProperty(k)) {
      this.datasets[k].resetExpressions();
    }
    // NOTE: Also reset the scaled result vectors of experiments, as these
    // depend on model time scale which may be changed.
    for(const x of this.experiments) x.resetScaledVectors();
  }

  compileExpressions() {
    // Compile all expression attributes of all model entities
    for(const x of this.allExpressions) x.compile();
  }
  
  /* SPECIAL MODEL CALCULATIONS */
  
  calculateCostPrices(t) {
    // Calculate cost prices of products and processes for time step t.
    let products = [],
        processes = [],
        links = [],
        constraints = [],
        can_calculate = true;
    const
        // NOTE: Define local functions as constants.
        costAffectingConstraints = (p) => {
            // Return number of relevant contraints (see below) that
            // can affect the cost price of product or process `p`.
            let n = 0;
            for(const c of constraints) {
              if(!MODEL.ignored_entities[c.identifier] &&
                  ((c.to_node === p && c.soc_direction === VM.SOC_X_Y) ||
                  (c.from_node === p && c.soc_direction === VM.SOC_Y_X))) n++;
            }
            return n;
          },
        inputsFromProcesses = (p, t) => {
            // Return a tuple {n, nosoc, nz} where n is the number of input
            // links from processes, nosoc the number of these that carry
            // no cost, and nz the number of links having actual flow > 0.
            let tuple = {n: 0, nosoc: 0, nz: 0};
            for(const l of p.inputs) {
              // NOTE: Only process --> product links can carry cost.
              if(!MODEL.ignored_entities[l.identifier] &&
                  l.from_node instanceof Process) {
                tuple.n++;
                if(l.share_of_cost === 0) tuple.nosoc++;
                const d = l.actualDelay(t);
                if(l.actualFlow(t + d) > VM.NEAR_ZERO) tuple.nz++;
              }
            }
            return tuple;
          };

    // First scan constraints X --> Y: these must have SoC > 0 and moreover
    // the level of both X and Y must be non-zero, or they transfer no cost.
    for(let k in this.constraints) if(this.constraints.hasOwnProperty(k) &&
        !MODEL.ignored_entities[k]) {
      const
          c = this.constraints[k],
          fl = c.from_node.nonZeroLevel(t),
          tl = c.to_node.nonZeroLevel(t);
      if(c.share_of_cost &&
          Math.abs(fl) > VM.NEAR_ZERO && Math.abs(tl) > VM.NEAR_ZERO) {
        // Constraint can carry cost => compute the rate; the actual
        // cost to be transferred will be computed later, when CP of
        // nodes have been calculated.
        if(c.soc_direction === VM.SOC_X_Y) {
          c.transfer_rate = c.share_of_cost * fl / tl;
        } else {
          c.transfer_rate = c.share_of_cost * tl / fl;
        }
        constraints.push(c);
      }
    }
    // Then scan the processes.
    for(let k in this.processes) if(this.processes.hasOwnProperty(k) &&
        !MODEL.ignored_entities[k]) {
      const
          p = this.processes[k],
          pl = p.nonZeroLevel(t);
      if(pl < 0) {
        // Negative levels invalidate the cost price calculation.
        p.cost_price[t] = VM.UNDEFINED;
        can_calculate = false;
        break;
      }
      // Count constraints that affect CP of this process.
      let n = costAffectingConstraints(p);
      if(n || p.inputs.length) {
        // All inputs can affect the CP of a process.
        p.cost_price[t] = VM.UNDEFINED;
        processes.push(p);
      } else {
        // No inputs or cost-transferring constraints, then CP = 0
        // unless output products have price < 0.
        let negpr = 0;
        for(const l of p.outputs) {
          const
              // NOTE: *add* delay to consider *future* price & rate!
              dt = t + l.actualDelay(t),
              px = l.to_node.price,
              pr = (px.defined ? px.result(dt) : 0);
          if(pr < 0) negpr -= pr * l.relative_rate.result(dt);
        }
        p.cost_price[t] = negpr;
        // Done, so not add to `processes` list.
      }
    }
    // Then scan the products.
    for(let k in this.products) if(this.products.hasOwnProperty(k) &&
        !MODEL.ignored_entities[k]) {
      const p = this.products[k];
      let ifp = inputsFromProcesses(p, t),
          nc = costAffectingConstraints(p);
      if(p.is_buffer && !ifp.nz) {
        // Stocks for which all INput links have flow = 0 have the same
        // stock price as in t-1.
        // NOTE: It is not good to check for zero stock, as that may be
        // the net result of in/outflows.
        p.cost_price[t] = p.stockPrice(t - 1);
        p.stock_price[t] = p.cost_price[t];
      } else if(!nc && (ifp.n === ifp.nosoc || (!ifp.nz && ifp.n > ifp.nosoc + 1))) {
        // For products having only input links that carry no cost,
        // CP = 0 but coded as NO_COST so that this can propagate.
        // Furthermore, for products having no storage and *multiple*
        // cost-carrying input links that all are zero-flow, the cost
        // price cannot be inferred unambiguously => set to 0.
        p.cost_price[t] = (ifp.n && ifp.n === ifp.nosoc ? VM.NO_COST : 0);
      } else {
        // Cost price must be calculated.
        p.cost_price[t] = VM.UNDEFINED;
        products.push(p);
      }
      p.cost_price[t] = p.cost_price[t];
    }
    // Finally, scan all links, and retain only those for which the CP
    // can not already be inferred from their FROM node.
    // NOTE: Record all products having input links with a delay < 0, as
    // their cost prices depend on future time steps and hece will have
    // to be recomputed.
    for(let k in this.links) if(this.links.hasOwnProperty(k) &&
        !MODEL.ignored_entities[k]) {
      const
          l = this.links[k],
          ld = l.actualDelay(t),
          fn = l.from_node,
          fncp = fn.costPrice(t - ld),
          tn = l.to_node;
      if(fn instanceof Product && fn.price.defined) {
        // Links from products having a market price have this price
        // multiplied by their relative rate as unit CP.
        l.unit_cost_price = fn.price.result(t) * l.relative_rate.result(t);
      } else if((fn instanceof Process && l.share_of_cost === 0) ||
         (fn instanceof Product && tn instanceof Product)) {
        // Process output links that do not carry cost and product-to-
        // product links have unit CP = 0.
        l.unit_cost_price = 0;
      } else if(fncp !== VM.UNDEFINED && fncp !== VM.NOT_COMPUTED) {
        // Links that are output of a node having CP defined have UCP = CP.
        l.unit_cost_price = fncp * l.relative_rate.result(t);
      } else {
        l.unit_cost_price = VM.UNDEFINED;
        // Do not push links related to processes having level < 0.
        if(!(fn instanceof Process && fn.actualLevel(t - ld) < 0) &&
            !(tn instanceof Process && tn.actualLevel(t) < 0)) {
          links.push(l);
        }
        // Record TO node for time step t if link has negative delay.
        if(ld < 0) {
          const list = MODEL.products_with_negative_delays[t];
          if(list) {
            list.push(l.to_node);
          } else {
            MODEL.products_with_negative_delays[t] = [l.to_node];
          }
        }
      }
    }
    // Count entities that still need processing.
    let count = processes.length + products.length + links.length +
            constraints.length,
        prev_count = VM.PLUS_INFINITY;
    // Iterate until no more new CP have been calculated.
    while(count < prev_count) {
      // (1) Update the constraints.
      for(const c of constraints) {
        const
            // NOTE: Constraints in list have levels greater than near-zero.
            fl = c.from_node.actualLevel(t),
            tl = c.to_node.actualLevel(t);
        let tcp;
        if(c.soc_direction === VM.SOC_X_Y) {
          c.transfer_rate = c.share_of_cost * fl / tl;
          tcp = c.from_node.cost_price[t];
        } else {
          c.transfer_rate = c.share_of_cost * tl / fl;
          tcp = c.to_node.cost_price[t];
        }
        // Compute transferable cost price only when CP of X is known.
        if(tcp < VM.PLUS_INFINITY) {
          c.transfer_cp = c.transfer_rate * tcp;
        } else {
          c.transfer_cp = VM.UNDEFINED;
        }
      }
      
      // (2) Set CP of processes if unit CP of all their inputs is known.
      // NOTE: Iterate from last to first so that processes can be
      // removed from the list.
      for(let i = processes.length - 1; i >= 0; i--) {
        const p = processes[i];
        let cp = 0;
        for(const l of p.inputs) {
          if(!MODEL.ignored_entities[l.identifier]) {
            const ucp = l.unit_cost_price;
            if(ucp === VM.UNDEFINED) {
              cp = VM.UNDEFINED;
              break;
            } else {
              cp += ucp;
            }
          }
        }
        // NOTE: Also check constraints that transfer cost to `p`.
        for(const c of constraints) {
          if(c.to_node === p && c.soc_direction === VM.SOC_X_Y ||
             (c.from_node === p && c.soc_direction === VM.SOC_Y_X)) {
            if(c.transfer_cp === VM.UNDEFINED) {
              cp = VM.UNDEFINED;
              break;
            } else {
              cp += c.transfer_cp;
            }
          }
        }
        if(cp !== VM.UNDEFINED) {
          // Also consider negative prices of outputs.
          // NOTE: ignore SoC, as this affects the CP of the product, but
          // NOT the CP of the process producing it.
          for(const l of p.outputs) {
            if(!MODEL.ignored_entities[l.identifier]) {
              const
                  // NOTE: For output links always use current price.
                  px = l.to_node.price,
                  pr = (px.defined ? px.result(t) : 0),
                  // For levels, consider delay: earlier if delay > 0.
                  dt = t - l.actualDelay(t);
              if(pr < 0) {
                // Only consider negative prices.
                if(l.multiplier === VM.LM_LEVEL) {
                  // Treat links with level multiplier similar to input links,
                  // as this computes CP even when actual level = 0.
                  // NOTE: Subtract (!) so as to ADD the cost.
                  cp -= pr * l.relative_rate.result(dt);
                } else {
                  // For other types, multiply price by actual flow / level
                  // NOTE: actualFlow already considers delay => use t, not dt.
                  const af = l.actualFlow(t);
                  if(af > VM.NEAR_ZERO) {
                    // Prevent division by zero.
                    // NOTE: Level can be zero even if actual flow > 0!
                    let al = p.nonZeroLevel(dt, l.multiplier);
                    // NOTE: Scale to level only when level > 1, or fixed
                    // costs for start-up or first commit will be amplified.
                    if(al > VM.NEAR_ZERO) cp -= pr * af / Math.max(al, 1);
                  }
                }
              }
            }
          }
          // Set CP of process, and remove it from list.
          p.cost_price[t] = cp;
          processes.splice(i, 1);
          // Set the CP of constraints that transfer cost of `p`, while
          // removing the constraints that have contributed to its CP.
          for(let ci = constraints.length - 1; ci >= 0; ci--) {
            const c = constraints[ci];
            if(c.from_node === p) {
              if(c.soc_direction === VM.SOC_X_Y) {
                c.transfer_cp = c.transfer_rate * cp;
              } else {
                constraints.splice(ci, 1);
              }
            } else if(c.to_node === p) {
              if(c.soc_direction === VM.SOC_Y_X) {
                c.transfer_cp = c.transfer_rate * cp;
              } else {
                constraints.splice(ci, 1);
              }
            }
          }
          // Also set unit CP of outgoing links of `p` if still on the list...
          for(const l of p.outputs) {
            const li = links.indexOf(l);
            if(li >= 0) {
              // NOTE: If delay > 0, use earlier CP.
              const ld = l.actualDelay(t);
              l.unit_cost_price = l.share_of_cost *
                  p.costPrice(t - ld) *
                  l.relative_rate.result(t - ld);
              // ... and remove these links from the list.
              links.splice(li, 1);
            }
          }
        }
      }

      // (3) Set CP of products if CP of all *cost-carrying* inputs from
      // processes (!) and constraints is known.
      // NOTE: Iterate from last to first so that products can be
      // removed from the list.
      for(let pi = products.length - 1; pi >= 0; pi--) {
        const p = products[pi];
        let cp = 0,
            cnp = 0, // cost of newly produced product
            qnp = 0, // quantity of newly produced product
            // NOTE: Treat products having only one cost-carrying
            // input link as a special case, as this allows to compute
            // their CP also when there is no actual flow over this
            // link. `cp_sccp` (CP of single cost-carrying process)
            // is used to track whether this condition applies.
            cp_sccp = VM.COMPUTING;
        for(const l of p.inputs) {
          if(!MODEL.ignored_entities[l.identifier] &&
              l.from_node instanceof Process) {
            cp = l.from_node.costPrice(t - l.actualDelay(t));
            if(cp === VM.UNDEFINED && l.share_of_cost > 0) {
              // Contributing CP still unknown => break from FOR loop.
              break;
            } else {
              if(cp_sccp === VM.COMPUTING) {
                // First CC process having a defined CP => use this CP.
                cp_sccp = cp * l.share_of_cost;
              } else {
                // Multiple CC processes => set CP to 0.
                cp_sccp = 0;
              }
              // NOTE: actualFlow already considers delay => use t, not dt.
              const
                  af = l.actualFlow(t),
                  rr = l.relative_rate.result(t);
              if(Math.abs(af) > VM.NEAR_ZERO) {
                if(Math.abs(rr) < VM.NEAR_ZERO) {
                  cnp = (rr < 0 && cp < 0 || rr > 0 && cp > 0 ?
                      VM.PLUS_INFINITY : VM.MINUS_INFINITY);
                } else {
                  qnp += af;
                  // NOTE: Only add the link's share of cost.
                  cnp += af * cp / rr * l.share_of_cost;
                }
              }
            }
          }
        }
        // CP unknown => proceed with next product.
        if(cp === VM.UNDEFINED) continue;
        // CP of product is 0 if no new production UNLESS it has only
        // one cost-carrying production input, as then its CP equals
        // the CP of the producing process times the link SoC.
        // If new production > 0 then CP = cost / quantity.
        if(cp_sccp !== VM.COMPUTING) {
          cp = (qnp > 0 ? cnp / qnp : cp_sccp);
        }
        // NOTE: Now also check constraints that transfer cost to `p`.
        for(const c of constraints) {
          if(c.to_node === p && c.soc_direction === VM.SOC_X_Y ||
             (c.from_node === p && c.soc_direction === VM.SOC_Y_X)) {
            if(c.transfer_cp === VM.UNDEFINED) {
              cp = VM.UNDEFINED;
              break;
            } else {
              cp += c.transfer_cp;
            }
          }
        }
        // CP unknown => proceed with next product.
        if(cp === VM.UNDEFINED) continue;
        // Otherwise, set the cost price.
        p.cost_price[t] = cp;
        // For stocks, the CP includes stock price on t-1.
        if(p.is_buffer) {
          const prevl = p.nonZeroLevel(t-1);
          if(prevl > VM.NEAR_ZERO) {
            cp = (cnp +  prevl * p.stockPrice(t-1)) / (qnp + prevl);
          }
          p.stock_price[t] = cp;
        }
        // Set CP for outgoing links, and remove them from list.
        for(const l of p.outputs) {
          const li = links.indexOf(l);
          if(li >= 0) {
            l.unit_cost_price = cp * l.relative_rate.result(t);
            links.splice(li, 1);
          }
        }
        products.splice(pi, 1);
        // Set the CP of constraints that transfer cost of `p`, while
        // removing the constraints that have contributed to its CP.
        for(let ci = constraints.length - 1; ci >= 0; ci--) {
          const c = constraints[ci];
          if(c.from_node === p) {
            if(c.soc_direction === VM.SOC_X_Y) {
              c.transfer_cp = c.transfer_rate * cp;
            } else {
              constraints.splice(ci, 1);
            }
          } else if(c.to_node === p) {
            if(c.soc_direction === VM.SOC_Y_X) {
              c.transfer_cp = c.transfer_rate * cp;
            } else {
              constraints.splice(ci, 1);
            }
          }
        }
      }
      // Count remaining entities without calculated CP.
      prev_count = count;
      count = processes.length + products.length + links.length + constraints.length;
      // No new CPs found? Then try some other things before exiting the loop.
      if(count >= prev_count) {
        // Still no avail? Then set CP=0 for links relating to processes
        // having level 0.
        for(const p of processes) if(p.nonZeroLevel(t) < VM.NEAR_ZERO) {
          p.cost_price[t] = 0;
          for(let li = links.length - 1; li >= 0; li--) {
            const l = links[li];
            if(l.from_node === p || l.to_node === p) {
              l.unit_cost_price = 0;
              links.splice(li, 1);
            }
          }
        }
        // Then (also) look for links having AF = 0 ...
        for(let li = links.length - 1; li >= 0; li--) {
          const af = links[li].actualFlow(t);
          if(Math.abs(af) < VM.NEAR_ZERO) {
            // ... and set their UCP to 0.
            links[li].unit_cost_price = 0;
            links.splice(li, 1);
            // And break, as this may be enough to calculate more "regular" CPs.
            break;
          }
        }
        count = processes.length + products.length + links.length + constraints.length;
        if(count >= prev_count) {
          // No avail? Then look for links from stocks ...
          for(let li = links.length - 1; li >= 0; li--) {
            const
                l = links[li],
                p = l.from_node;
            if(p.is_buffer) {
              // ... and set their UCP to the previous stock price.
              l.unit_cost_price = (p.nonZeroLevel(t-1) > 0 ? p.stockPrice(t-1) : 0);
              links.splice(li, 1);
              // And break, as this may be enough to calculate more "regular" CPs.
              break;
            }
          }
          count = processes.length + products.length + links.length + constraints.length;
        }
      }
    }
    // For all products, calculate highest cost price, i.e., the unit cost
    // price of the most expensive process that provides input to this product
    // in time step t.
    for(let k in this.products) if(this.products.hasOwnProperty(k) &&
        !MODEL.ignored_entities[k]) {
      this.products[k].calculateHighestCostPrice(t);
    }
    return can_calculate;
  }
  
  flowBalance(cu, t) {
    // Return sum (for time t) of actual flows of output links minus sum
    // of actual flows of output links, given the cluster and unit passed
    // via `cu`.
    // NOTE: This implementation is not very efficient (it ALWAYS iterates
    // over all processes and their links IN and OUT), but this way it is
    // robust to changes in product units the modeler may make after cluster
    // balance variables have been parsed. The alternative (reparsing all
    // expressions and note fields) would be much more cumbersome.
    let b = 0,
        su = cu.u,
        dataflows = false;
    // NOTE: If unit ends with ! then data flows are considered as well.
    if(su.endsWith('!')) {
      dataflows = true;
      su = su.slice(0, -1).trim();
    }
    // Get all processes in the cluster.
    const ap = cu.c.allProcesses;
    // Sum over all processes MINUS the actual flows IN.
    for(const p of ap) {
      if(!MODEL.ignored_entities[p.identifier]) {
        for(const l of p.inputs) {
          // Only consider links having the default multiplier (LM_LEVEL) ...
          if(l.multiplier === VM.LM_LEVEL &&
              // ... and at their tail a product having specified scale unit
              // (or the balance unit is '' to indicate "any unit").
              (l.from_node.scale_unit === su || su === '')) {
            const af = l.actualFlow(t);
            // Return infinite values or error codes as such.
            if(af <= VM.MINUS_INFINITY || af > VM.PLUS_INFINITY) return af;
            // Subtract, as inflows are consumed.
            b -= af;
          }
        }
        // Apply the same procedure to process outflows.
        for(const l of p.outputs) {
          if(l.multiplier === VM.LM_LEVEL &&
              (l.to_node.scale_unit === su || su === '') &&
              // NOTE: For outflows, consider data only if told to!
              (dataflows || !l.to_node.is_data)) {
            const af = l.actualFlow(t);
            if(af <= VM.MINUS_INFINITY || af > VM.PLUS_INFINITY) return af;
            // Add, as outflows are produced.
            b += af;
          }
        }
      }
    }
    return b;
  }
  
  replaceProduct(p, r, global) {
    const
       ppi = this.focal_cluster.indexOfProduct(p),
       // NOTE: Record whether `r` is shown in focal cluster.
       rshown = this.focal_cluster.indexOfProduct(r) >= 0;
    // NOTE: since `ppi` should always be >= 0
    if(ppi >= 0) {
      // Build list of information needed for "undo".
      const undo_info = {
          p: p.displayName,
          r: r.displayName,
          g: global,
          lf: [],
          lt: [],
          cf: [],
          ct: [],
          cl: []
        };
      // Keep track of redirected links.
      const rl = [];
      // First replace product in (local) links.
      for(let i = p.inputs.length - 1; i >= 0; i--) {
        const l = p.inputs[i];
        if(global || l.hasArrow) {
          const ml = this.addLink(l.from_node, r);
          ml.copyPropertiesFrom(l);
          this.deleteLink(l);
          rl.push(ml);
          // NOTE: push identifier of *modified* link.
          undo_info.lt.push(ml.identifier);
        }
      }
      for(let i = p.outputs.length - 1; i >= 0; i--) {
        const l = p.outputs[i];
        if(global || l.hasArrow) {
          const ml = this.addLink(r, l.to_node);
          ml.copyPropertiesFrom(l);
          rl.push(ml);
          undo_info.lf.push(ml.identifier);
        }
      }
      // Then also replace product in (local) constraints
      // (also keeping track of affected constraints).
      const rc = [];
      for(let k in this.constraints) {
        if(this.constraints.hasOwnProperty(k)) {
          const c = this.constraints[k];
          if(c.from_node === p && (global || c.hasArrow)) {
            const mc = this.addConstraint(r, c.to_node);
            mc.copyPropertiesFrom(c);
            rc.push(mc);
            undo_info.cf.push(mc.identifier);
          } else if(c.to_node === p && (global || c.hasArrow)) {
            const mc = this.addConstraint(c.from_node, r);
            mc.copyPropertiesFrom(c);
            rc.push(mc);
            undo_info.ct.push(mc.identifier);
          }
        }
      }
      // Replace `p` by `r` as the positioned product.
      const pp = this.focal_cluster.product_positions[ppi];
      undo_info.x = pp.x;
      undo_info.y = pp.y;
      pp.product = r;
      // Change coordinates only if `r` is also shown in the focal cluster.
      if(rshown) {
        pp.x = r.x;
        pp.y = r.y;
      }
      // Likewise replace product of other placeholders of `p` by `r`.
      for(let k in this.clusters) if(this.clusters.hasOwnProperty(k)) {
        const
            c = this.clusters[k],
            ppi = c.indexOfProduct(p);
        // NOTE: When local, replace only if sub-cluster is in view...
        if(ppi >= 0 && (global || this.focal_cluster.containsCluster(c))) {
          const pp = c.product_positions[ppi];
          // ... and then it MAY be that within this sub-cluster, the local
          // links to `p` were NOT redirected.
          const ll = [];
          for(const l of p.inputs) {
            if(rl.indexOf(l) < 0 && ((l.from_node instanceof Process &&
                c.containsProcess(l.from_node)) ||
                c.containsProduct(l.from_node))) ll.push(l);
          }
          for(const l of p.outputs) {
            if(rl.indexOf(l) < 0 && ((l.to_node instanceof Process &&
                c.containsProcess(l.to_node)) ||
                c.containsProduct(l.to_node))) ll.push(l);
          }
          // `p` must be replaced by `r` only when `c` contains NO
          // "un-redirected" links.
          if(ll.length === 0) {
            pp.product = r;
            undo_info.cl.push(c.identifier);
          }
        }
        c.clearAllProcesses();
      }
      // Now prepare for undo, so that deleteNode can add its XML.
      UNDO_STACK.push('replace', undo_info);
      // Delete original product `p` if it has no more product positions.
      if(!this.top_cluster.containsProduct(p)) this.deleteNode(p);
    }
    // Prepare for redraw.
    this.focal_cluster.clearAllProcesses();
    UI.drawDiagram(this);
  }
  
  differences(m) {
    // Return "dictionary" with differences between this model and model `m`.
    const d = {};
    // Start with the Linny-R model properties
    let diff = differences(this, m, Object.keys(UI.MC.SETTINGS_PROPS));
    if(Object.keys(diff).length > 0) d.settings = diff;
    // NOTE: dataset differences will also detect equation differences.
    for(const ep of UI.MC.ENTITY_PROPS) {
      diff = {};
      // Check for added / modified entities in this model (relative to `m`).
      for(let k in this[ep]) if(this[ep].hasOwnProperty(k)) {
        if(k in m[ep]) {
          // NOTE: Each entity type has its own `differences` method
          // that returns a "dictionary" with modified properties.
          const edif = this[ep][k].differences(m[ep][k]);
          if(edif) {
            if(k === UI.EQUATIONS_DATASET_ID) {
              d.equations = edif;
            } else {
              diff[k] = [UI.MC.MODIFIED, this[ep][k].displayName, edif];
            }
          }
        } else {
          diff[k] = [UI.MC.ADDED, this[ep][k].displayName];
        }
      }
      // Check for entities in `m` that do not exist in this model.
      for(let k in m[ep]) if(m[ep].hasOwnProperty(k)) {
        if(!(k in this[ep])) {
          diff[k] = [UI.MC.DELETED, m[ep][k].displayName];
        }
      }
      // Only add differences for entity property `ep` if any were detected.
      if(Object.keys(diff).length > 0) d[ep] = diff;
    }
    // Check for link and constraint differences.
    // NOTE: Link and constraint IDs are based on entity codes, and these can
    // be identical across models while denoting different entities, hence also
    // check whether display names are identical -- this may list links as
    // changed while only their nodes has been renamed.
    for(const lcp of ['links', 'constraints']) {
      diff = {};
      for(let k in this[lcp]) if(this[lcp].hasOwnProperty(k)) {
        const
            lc = this[lcp][k],
            n = lc.displayName; 
        if(k in m[lcp] && m[lcp][k].displayName === n) {
          const edif = lc.differences(m[lcp][k]);
          if(edif) diff[k] = [UI.MC.MODIFIED, n, edif];
        } else {
          diff[k] = [UI.MC.ADDED, n];
        }
      }
      for(let k in m[lcp]) if(m[lcp].hasOwnProperty(k)) {
        const
            lc = m[lcp][k],
            n = lc.displayName; 
        if(!(k in this[lcp] && this[lcp][k].displayName === n)) {
          diff[k] = [UI.MC.DELETED, n];
        }
      }
      if(Object.keys(diff).length > 0) d[lcp] = diff;
    }
    // Check for new or modified charts.
    diff = {};
    for(const c of this.charts) {
      const cid = UI.nameToID(c.title);
      let mc = null;
      for(const cc of m.charts) {
        if(UI.nameToID(cc.title) === cid) {
          mc = cc;
          break;
        }
      }
      if(mc) {
        const cdiff = c.differences(mc);
        if(cdiff) diff[cid] = [UI.MC.MODIFIED, c.title, cdiff];
      } else {
        diff[cid] = [UI.MC.ADDED, c.title];
      }
    }
    // Check for deleted charts.
    for(const mc of m.charts) {
      const mcid = UI.nameToID(mc.title);
      let c = null;
      for(const cc of this.charts) {
        if(UI.nameToID(cc.title) === mcid) {
          c = cc;
          break;
        }
      }
      if(!c) diff[mcid] = [UI.MC.DELETED, mc.title];
    }
    if(Object.keys(diff).length > 0) d.charts = diff;
    // Check for new or modified experiments.
    diff = {};
    for(const x of this.experiments) {
      const xid = UI.nameToID(x.title);
      let mx = null;
      for(const xx of m.experiments) {
        if(UI.nameToID(xx.title) === xid) {
          mx = xx;
          break;
        }
      }
      if(mx) {
        const xdiff = x.differences(mx);
        if(xdiff) diff[xid] = [UI.MC.MODIFIED, x.title, xdiff];
      } else {
        diff[xid] = [UI.MC.ADDED, x.title];
      }
    }
    // Check for deleted experiments.
    for(const mx of m.experiments) {
      const mxid = UI.nameToID(mx.title);
      let x = null;
      for(const xx of this.experiments) {
        if(UI.nameToID(xx.title) === mxid) {
          x = xx;
          break;
        }
      }
      if(!x) diff[mxid] = [UI.MC.DELETED, mx.title];
    }
    if(Object.keys(diff).length > 0) d.experiments = diff;
    // Return the now complete differences "dictionary".
    return d;
  }
  
} // END of class LinnyRModel


// CLASS ModelParameter
class ModelParameter {
  // Superclass for Import and Export
  constructor(m, e=null) {
    if(e instanceof Actor || e instanceof Dataset || e instanceof Product) {
      this.entity = e;
      this.is_data = e instanceof Product && e.is_data;
    } else if(e instanceof Element) {
      this.initFromXML(m, e);
    } else {
      throw 'Only actors, datasets and products can be model parameters';
    }
  }
  
  initFromXML(model, node) {
    const
        n = xmlDecoded(nodeContentByTag(node, 'name')),
        t = nodeContentByTag(node, 'type'),
        d = nodeContentByTag(node, 'is-data') === '1',
        e = model.objectByName(n);
    if(!e) throw `Unknown parameter "${n}"`;
    if(e.type !== t) throw `Parameter "${n}" is not of type ${t}`;
    if(d && !e.is_data) throw `Product parameter "${n}" is not data`;
    this.entity = e;
    this.is_data = d;
  }

} // END of class ModelParameter


// CLASS Import
class Import extends ModelParameter {
  constructor(m, e) {
    super(m, e); 
  }

  get asXML() {
    const data = (this.entity instanceof Product && this.entity.is_data ?
        '1' : '0');
    return ['<import><type>', this.entity.type,
        '</type><is-data>', data,
        '</is-data><name>', xmlEncoded(this.entity.displayName),
        '</name></import>'].join('');
  }
  
} // END of class Import 


// CLASS Export
class Export extends ModelParameter {
  constructor(m, e) {
    super(m, e); 
  }

  get asXML() {
    const data = (this.entity instanceof Product && this.entity.is_data ?
        '1' : '0');
    return ['<export><type>', this.entity.type,
        '</type><is-data>', data,
        '</is-data><name>', xmlEncoded(this.entity.displayName),
        '</name></export>'].join('');
  }
  
} // END of class Export 


// CLASS IOBinding
class IOBinding {
  constructor(iot, et, data, n) {
    this.id = UI.nameToID(n);
    this.io_type = iot;
    this.entity_type = et;
    this.is_data = data;
    this.name_in_module = n;
    if(iot === 2) {
      // For export parameters, the actual name IS the formal name.
      this.actual_id = this.id;
      this.actual_name = n;
    } else {
      this.actual_id = '';
      this.actual_name = '';
    }
  }

  get copy() {
    // Return a copy of this binding.
    const copy = new IOBinding(this.io_type, this.entity_type,
        this.is_data, this.name_in_module);
    copy.id = this.id;
    copy.actual_name = this.actual_name;
    copy.actual_id = this.actual_id;
    return copy;
  }

  bind(an) {
    // Establish a binding with actual name `an` if this entity is known to be
    // of the correct type (and for products also a matching data property)
    const
        aid = UI.nameToID(an),
        s = MODEL.setByType(this.entity_type);
    if(s.hasOwnProperty(aid)) {
      const e = s[aid];
      if(e instanceof Product && e.is_data !== this.is_data) {
        throw `Invalid binding: data property mismatch for "${an}"` +
            this.entity_type;
      } else {
        this.actual_name = an;
        this.actual_id = aid;
      }
    }
    throw `Invalid binding: "${an}" is not of type ${this.entity_type}`;
  }
  
  get asXML() {
    // Return an XML string that encodes this binding.
    return ['<iob type="', this.io_type, '" name="', xmlEncoded(this.name_in_module),
        '" entity="', VM.entity_letter_codes[this.entity_type.toLowerCase()],
        (this.is_data ? ' data="1"' : ''), '">',
        xmlEncoded(this.actual_name), '</iob>'].join('');
  }
  
  get asHTML() {
    // Return an HTML string that represents the table rows for this binding.
    if(this.io_type === 0) return '';
    const
        ioc = ['no', 'i', 'o'],
        datastyle = (this.is_data ?
            '; text-decoration: 1.5px dashed underline' : '');
    let html = ['<tr class="', ioc[this.io_type],  '-param">',
        '<td style="padding-bottom: 2px">',
        '<span style="font-style: normal; font-weight: normal', datastyle, '">',
        this.entity_type, ':</span> ', this.name_in_module].join('');
    if(this.io_type === 1) {
      // An IMPORT binding generates two rows: the formal name (in the module)
      // and the actual name (in the current model) as dropdown box.
      // NOTE: The first (default) option is the *prefixed* formal name, which
      // means that the parameter is not bound to an entity in the current model.
      html += ['<br>&rdca;<select id="', this.id, '" name="', this.id,
          '" class="i-param"><option value="_CLUSTER" style="color: purple">Cluster: ',
          this.name_in_module, '</option>'].join('');
      const
          s = MODEL.setByType(this.entity_type),
          tail = ':_' + this.name_in_module.toLowerCase(),
          index = Object.keys(s).sort(
              (a, b) => compareTailFirst(a, b, tail));
      if(s === MODEL.datasets) {
        // NOTE: Do not list the model equations as dataset.
        const i = index.indexOf(UI.EQUATIONS_DATASET_ID);
        if(i >= 0) index.splice(i, 1);
      }
      // NOTE: Do not list "black-boxed" entities.
      for(const key of index) if(!key.startsWith(UI.BLACK_BOX)) {
        const e = s[key];
        if(!(e instanceof Product) || this.is_data === e.is_data) {
          html += `<option value="${key}">${e.displayName}</option>`;
        }
      }
      html += '</select>';
    }
    return html + '</td></tr>';
  }
  
} // END of class IOBinding


// CLASS IOContext
class IOContext {
  constructor(repo='', file='', node=null) {
    // Get the import/export interface of the model to be included.
    this.prefix = '';
    this.bindings = {};
    // Keep track which entities are superseded by "exports"
    this.superseded = [];
    // Keep track which entities are added or superseded (to select them)
    this.added_nodes = [];
    this.added_links = [];
    // Count number of replaced entities in expressions.
    this.replace_count = 0;
    this.expression_count = 0;
    // NOTE: IOContext can be "dummy" when used to rename expression variables.
    if(!repo || !file || !node) return;
    // When updating, set `recompile` to false for all but the last include
    // so as to prevent compiler warnings due to missing datasets.
    this.recompile = true;
    this.xml = node;
    this.repo_name = repo;
    this.file_name = file;
    let n = childNodeByTag(node, 'imports');
    if(n) {
      for(const c of n.childNodes) if(c.nodeName === 'import') {
        // NOTE: IO type 1 indicates import.
        this.addBinding(1, xmlDecoded(nodeContentByTag(c, 'type')),
            nodeContentByTag(c, 'is-data') === '1',
            xmlDecoded(nodeContentByTag(c, 'name')));
      }
    }
    n = childNodeByTag(node, 'exports');
    if(n) {
      for(const c of n.childNodes) if(c.nodeName === 'export') {
        // NOTE: IO type 2 indicates export.
        this.addBinding(2, xmlDecoded(nodeContentByTag(c, 'type')),
            nodeContentByTag(c, 'is-data') === '1',
            xmlDecoded(nodeContentByTag(c, 'name')));
      }
    }
  }
  
  addBinding(iot, et, data, n) {
    // Add a new binding (IO type, entity type, is-data, formal name)
    // to this context.
    this.bindings[UI.nameToID(n)] = new IOBinding(iot, et, data, n);
  }

  bind(fn, an) {
    // Bind the formal name `fn` of an entity in a module to the actual
    // name `an` it will have in the current model.
    const id = UI.nameToID(fn);
    if(this.bindings.hasOwnProperty(id)) {
      this.bindings[id].bind(an);
    } else {
      throw `Undefined binding: "${fn}"`;
    }
  }
  
  isBound(n) {
    // Return the IO type of the binding if name `n` is a module parameter.
    const id = UI.nameToID(n);
    if(this.bindings.hasOwnProperty(id)) return this.bindings[id].io_type;
    return 0;
  }
  
  isBinding(obj) {
    // Return the binding if `obj` is bound by this IOContext, otherwise NULL.
    const
        an = obj.displayName,
        et = obj.type;
    for(const k of Object.keys(this.bindings)) {
      const iob = this.bindings[k];
      if(iob.entity_type === et && iob.actual_name === an) return iob;
    }
    return null;
  }
  
  get copyOfBindings() {
    // Return a deep copy of the bindings object.
    const copy = {};
    for(const k of Object.keys(this.bindings)) {
      copy[k] = this.bindings[k].copy;
    }
    return copy;
  }

  actualName(n, an='') {
    // Return the actual name for a parameter with formal name `n`
    // (and for processes and clusters: with actor name `an` if specified and
    // not "(no actor)").
    // NOTE: Do not modify (no actor), nor the "dataset dot".
    if(n === UI.NO_ACTOR || n === '.') return n;
    // NOTE: Do not modify "prefix-relative" variables.
    if(n.startsWith(':')) return n;
    // NOTE: The top cluster of the included model has the prefix as its name.
    if(n === UI.TOP_CLUSTER_NAME || n === UI.FORMER_TOP_CLUSTER_NAME) {
      return this.prefix;
    }
    if(an && an !== UI.NO_ACTOR) {
      an = ` (${this.actualName(an)})`; // Recursion, but max. depth = 1
    } else {
      an = '';
    }
    const id = UI.nameToID(n + an);
    if(this.bindings.hasOwnProperty(id)) {
      // NOTE: Return actual name WITHOUT the actor name.
      n = this.bindings[id].actual_name;
      if(an) n = n.slice(0, n.length - an.length);
      return n;
    }
    // All other entities are prefixed.
    return (this.prefix ? this.prefix + UI.PREFIXER : '') + n;
  }
  
  get clusterName() {
    // Return full cluster name, i.e., prefix plus actor name if specified.
    if(this.actor_name) return `${this.prefix} (${this.actor_name})`;
    return this.prefix;
  }
  
  get parameterTable() {
    // Return the HTML for the parameter binding table in the include dialog.
    if(Object.keys(this.bindings).length === 0) {
      return '<div style="margin-top:2px"><em>This module has no parameters.</em></div>';
    }
    const html = [];
    for(let id in this.bindings) if(this.bindings.hasOwnProperty(id)) {
      html.push(this.bindings[id].asHTML);
    }
    return '<table style="width:100%; border-collapse:collapse">' +
        html.join('') + '</table>';
  }
  
  bindParameters() {
    // Bind parameters as specified in the INCLUDE MODULE dialog.
    const pref = (this.prefix ? this.prefix + UI.PREFIXER : '');
    // Compute sum of (x, y) of imported products.
    let np = 0,
        x = 0,
        y = 0,
        ndp = 0,
        dx = 0,
        dy = 0;
    for(let id in this.bindings) if(this.bindings.hasOwnProperty(id)) {
      const b = this.bindings[id];
      if(b.io_type === 1) {
        // Get the selector for this parameter.
        // NOTE: IO_CONTEXT is instantiated *exclusively* by the Repository
        // browser, so that GUI dialog will exist when IO_CONTEXT is not NULL.
        const e = REPOSITORY_BROWSER.parameterBinding(b.id);
        if(e && e.selectedIndex >= 0) {
          // Modeler has selected the actual parameter => set its name.
          const v = e.options[e.selectedIndex].value;
          if(v !== '_CLUSTER') {
            b.actual_name = e.options[e.selectedIndex].text;
            b.actual_id = v;
            // If imported product, add its (x, y) to the centroid (x, y).
            if(b.entity_type === 'Product') {
              const p = MODEL.products[v];
              if(p) {
                const pp = p.positionInFocalCluster;
                if(pp) {
                  if(p.is_data) {
                    ndp++;
                    dx += pp.x;
                    dy += pp.y;
                  } else {
                    np++;
                    x += pp.x;
                    y += pp.y;
                  }
                }
              }
            }
          }
        }
        if(b.actual_id === '') {
          // By default, bind import parameter to itself (create a local entity).
          b.actual_name = pref + b.name_in_module;
          b.actual_id = UI.nameToID(b.actual_name);
        }
      }
    }
    // NOTE: Calculate centroid of non-data products if possible.
    if(np > 1) {
      this.centroid_x = Math.round(x / np);
      this.centroid_y = Math.round(y / np);
    } else if(np + ndp > 1) {
      this.centroid_x = Math.round((x + dx) / (np + ndp));
      this.centroid_y = Math.round((y + dy) / (np + ndp));
    } else if(np + ndp == 1) {
      this.centroid_x = Math.round(x + dx + 50);
      this.centroid_y = Math.round(y + dy + 50);
    } else {
      // Position new cluster in upper-left quadrant of view.
      const cp = UI.pointInViewport(0.25, 0.25);
      this.centroid_x = cp[0];
      this.centroid_y = cp[1];      
    }
    console.log('BINDINGS:', this.bindings);
  }
  
  supersede(obj) {
    // Log that entity `obj` is superseded, i.e., that this entity already
    // exists in the current model, and is initialized anew from the XML of
    // the model that is being included. The log is shown to modeler afterwards.
    addDistinct(obj.type + UI.PREFIXER + obj.displayName, this.superseded);
  }
  
  rewrite(x, n1='', n2='') {
    // Replace entity names of variables used in expression `x` by their
    // actual name after inclusion.
    // NOTE: When strings `n1` and `n2` are passed, replace entity name `n1`
    // by `n2` in all variables (this is not IO-related, but used when the
    // modeler renames an entity).
    // NOTE: Nothing to do if expression contains no variables.
    if(x.text.indexOf('[') < 0) return;
    const rcnt = this.replace_count;
    let s = '',
        p = -1,
        q = -1,
        ss,
        vb,
        v,
        a,
        stat;
    while(true) {
      p = x.text.indexOf('[', q + 1);
      if(p < 0) {
        // No more '[' => add remaining part of text, and quit.
        s += x.text.slice(q + 1);
        break;
      }
      // Add part from last ']' up to new '['.
      s += x.text.slice(q + 1, p);
      // Find next ']'
      q = indexOfMatchingBracket(x.text, p);
      // Get the bracketed text (without brackets).
      ss = x.text.slice(p + 1, q);
      // Separate into variable and attribute + offset string (if any).
      vb = ss.lastIndexOf('|');
      if(vb >= 0) {
        v = ss.slice(0, vb);
        // NOTE: Attribute string includes the vertical bar '|'.
        a = ss.slice(vb);
      } else {
        // Separate into variable and offset string (if any).
        vb = ss.lastIndexOf('@');
        if(vb >= 0) {
          v = ss.slice(0, vb);
          // NOTE: Attribute string includes the "at" sign '@'.
          a = ss.slice(vb);
        } else {
          v = ss;
          a = '';
        }
      }
      let by_ref = '';
      if(v.trim().startsWith('!')) {
        by_ref = '!';
        v = v.replace('!', '');
      }
      let brace = '';
      if(v.trim().startsWith('{')) {
        brace = v.split('}');
        if(brace.length > 1) {
          v = brace.pop();
          brace = brace.join('}') + '}';
        } else {
          brace = '';
        }
      }
      // NOTE: Patterns used to compute statistics must not be rewritten.
      let doit = true;
      stat = v.split('$');
      if(stat.length > 1 && VM.statistic_operators.indexOf(stat[0]) >= 0) {
        if(brace) {
          // NOTE: This does not hold for statistics for experiment outcomes,
          // because there no patterns but actual names are used.
          brace += stat[0] + '$';
          v = stat.slice(1).join('$');
        } else {
          doit = false;
        }
      }
      if(doit) {
        // NOTE: When `n1` and `n2` have been specified, compare `v` with `n1`,
        // and if matching, replace it by `n2`.
        if(n1 && n2) {
          // NOTE: UI.replaceEntity handles link names by replacing either the
          // FROM or TO node name if it matches with `n1`.
          const r = UI.replaceEntity(v, n1, n2);
          // Only replace `v` by `r` in case of a match.
          if(r) {
            this.replace_count++;
            v = r;
          }
        } else {
          // When `n1` and `n2` are NOT specified, rewrite the variable
          // using the parameter bindings.
          // NOTE: Link variables contain TWO entity names.
          if(v.indexOf(UI.LINK_ARROW) >= 0) {
            const ln = v.split(UI.LINK_ARROW);
            v = this.actualName(ln[0]) + UI.LINK_ARROW + this.actualName(ln[1]);
          } else {
            v = this.actualName(v);
          }
        }
      }
      // Add [actual name|attribute string] while preserving "by reference".
      s += `[${brace}${by_ref}${v}${a}]`;
    }
    // Increase expression count when 1 or more variables were replaced.
    if(this.replace_count > rcnt) this.expression_count++;
    // Replace the original expression by the new one.
    x.text = s;
    // Force expression to recompile.
    x.code = null;
  }
  
  addedNode(node) {
    // Record that node was added.
    this.added_nodes.push(node);
  }

  addedLink(link) {
    // Record that link was added.
    this.added_links.push(link);
  }

} // END of class IOContext


// CLASS ScaleUnit
class ScaleUnit {
  constructor(name, scalar, base_unit) {
    this.name = name;
    // NOTES:
    // (1) Undefined or empty strings default to '1'
    // (2) Multiplier is stored as string to preserve modeler's notation
    this.scalar = scalar || '1';
    this.base_unit = base_unit || '1';
  }
  
  get multiplier() {
    // Returns scalar as number
    return safeStrToFloat(this.scalar, 1);
  }
  
  conversionRates() {
    // Returns a "dictionary" {U1: R1, U2: R2, ...} such that Ui is a
    // scale unit that can be converted to *this* scaleunit U at rate Ri
    const cr = {};
    let p = 0, // previous count of entries
        n = 1;
    // At least one conversion: U -> U with rate 1
    cr[this.name] = 1; 
    if(this.base_unit !== '1') {
      // Second conversion: U -> base of U with modeler-defined rate
      cr[this.base_unit] = this.multiplier;
      n++;
    }
    // Keep track of the number of keys; terminate as no new keys
    while(p < n) {
      p = n;
      // Iterate over all convertible scale units discovered so far
      for(let u in cr) if(cr.hasOwnProperty(u)) {
        // Look for conversions to units NOT yet detected
        for(let k in MODEL.scale_units) if(k != '1' &&
            MODEL.scale_units.hasOwnProperty(k)) {
          const
              su = MODEL.scale_units[k],
              b = su.base_unit;
          if(b === '1') continue;
          if(!cr.hasOwnProperty(k) && cr.hasOwnProperty(b)) {
            // Add unit if new while base unit is convertible
            cr[k] = cr[b] / su.multiplier;
            n++;
          } else if(cr.hasOwnProperty(k) && !cr.hasOwnProperty(b)) {
            // Likewise, add base unit if new while unit is convertible
            cr[b] = cr[k] * su.multiplier;
            n++;
          }
        }
      }
    }
    return cr;
  }

  get asXML() {
    return ['<scaleunit><name>', xmlEncoded(this.name),
        '</name><scalar>', this.scalar,
        '</scalar><base-unit>', xmlEncoded(this.base_unit),
        '</base-unit></scaleunit>'].join('');
  }
  
  // NOTE: NO initFromXML because scale units are added directly

  differences(u) {
    // Return "dictionary" of differences, or NULL if none
    const d = differences(this, u, UI.MC.UNIT_PROPS);
    if(Object.keys(d).length > 0) return d;
    return null;
  }
}

// CLASS PowerGrid
class PowerGrid {
  constructor(id) {
    // NOTE: PowerGrids are uniquely identified by a hexadecimal string.
    this.id = id;
    this.name = '';
    this.comments = '';
    // Default color is blue (arbitrary choice).
    this.color = '#0000ff';
    // Default voltage is 150 kV (arbitrary choice).
    this.kilovolts = 150;
    // Default power unit is MW (will be used as unit of grid nodes)
    this.power_unit = 'MW';
    this.kirchhoff = true;
    // Loss approximation can be 0 (no losses), 1 (linear with load),
    // 2 (quadratic, approximated with two linear tangents) or
    // 3 (quadratic, approximated with three linear tangents).
    this.loss_approximation = 0;
  }

  get type() {
    return 'Grid';
  }
  
  get displayName() {
    return this.name;
  }
  
  get voltage() {
    // Return the voltage in the most compact human-readable notation.
    const kv = this.kilovolts;
    if(kv < 0.5) return Math.round(kv * 1000) + '&thinsp;V';
    if(kv < 10) return kv.toPrecision(2) + '&thinsp;kV';
    if(kv >= 999.5) return (kv * 0.001).toPrecision(2) + '&thinsp;MV';
    return Math.round(kv) + '&thinsp;kV';
  }
  
  // NOTE: The functions below are based on Birchfield et al. (2017)
  // A Metric-Based Validation Process to Assess the Realism of Synthetic
  // Power Grids. Energies, 10(1233). DOI: 10.3390/en10081233.
  // Table 3 in this paper lists for 6 voltage levels (115 - 500 kV) the
  // median of per unit per km reactance, and Table 4 lists for the same
  // voltage levels the median of X/R ratios.
  
  get reactancePerKm() {
    // Approximate resistance based on reactance per km and voltage.
    // The curve 28 * (kV ^ -1.9) fits quite well on the Table 3 data.
    return 28 * Math.pow(this.kilovolts, -1.9);
  }
  
  get resistancePerKm() {
    // Approximate resistance based on reactance per km and voltage.
    // The line 0.032 * kV + 1 fits quite well on the Table 4 data.
    // NOTE: Scaled by 0.003 because approximation gave unrealistic
    // high losses. This is a "quick fix" for lack of better knowledge.
    return 0.003 * this.reactancePerKm / (0.032 * this.kilovolts + 1);
  }

  get asXML() {
    let p = ` loss-approximation="${this.loss_approximation}"`;
    if(this.kirchhoff) p += ' kirchhoff="1"';
    return ['<grid', p, '><id>', this.id,
        '</id><name>', xmlEncoded(this.name),
        '</name><notes>', xmlEncoded(this.comments),
        '</notes><color>', this.color,
        '</color><kilovolts>', this.kilovolts,
        '</kilovolts><power-unit>', this.power_unit,
        '</power-unit></grid>'].join('');
  }
  
  initFromXML(node) {
    this.loss_approximation = safeStrToInt(
        nodeParameterValue(node, 'loss-approximation'), 0);
    this.name = xmlDecoded(nodeContentByTag(node, 'name'));
    this.comments = xmlDecoded(nodeContentByTag(node, 'notes'));
    this.kirchhoff = nodeParameterValue(node, 'kirchhoff') === '1';
    this.color = nodeContentByTag(node, 'color');
    this.kilovolts = safeStrToFloat(nodeContentByTag(node, 'kilovolts'), 150);
    this.power_unit = nodeContentByTag(node, 'power-unit') || 'MW';
  }
  
} // END of class PowerGrid


// CLASS Actor
class Actor {
  constructor(name) {
    this.name = name;
    this.comments = '';
    // By default, actors are labeled in formulas with the letter a.
    this.TEX_id = 'a';
    // Actors have 1 input attribute: W
    this.weight = new Expression(this, 'W', '1');
    // Actors have 3 result attributes: CF, CI and CO
    this.cash_flow = [];
    this.cash_in = [];
    this.cash_out = [];
    // Actors each have two variables in the simplex tableau that will compute
    // the sum of cash inflows resp. cash outflows of the actors' processes
    this.cash_in_var_index = -1;
    this.cash_out_var_index = -1;
    // Integer with the N-th bit indicating whether this actor can NOT change
    // its production levels in round N (so 1 = maintain level of previous round)
    this.round_flags = 0;
  }

  get type() {
    return 'Actor';
  }

  get typeLetter() {
    return 'A';
  }

  get identifier() {
    return UI.nameToID(this.name);
  }
  
  get displayName() {
    return this.name;
  }
  
  get attributes() {
    const a = {name: this.displayName };
    a.W = this.weight.asAttribute;
    if(MODEL.solved) {
      const t = MODEL.t;
      a.CF = this.cash_flow[t];
      a.CI = this.cash_in[t];
      a.CO = this.cash_out[t];
    }
    return a;
  }
  
  get numberContext() {
    // Returns the string to be used to evaluate #
    // NOTE: this does not apply to actors, so always empty string
    return '';
  }
  
  get asXML() {
    return ['<actor round-flags="', this.round_flags,
        '"><name>', xmlEncoded(this.name),
        '</name><notes>', xmlEncoded(this.comments),
        '</notes><tex-id>', this.TEX_id,
        '</tex-id><weight>', this.weight.asXML,
        '</weight></actor>'].join('');
  }
  
  initFromXML(node) {
    this.TEX_id = xmlDecoded(nodeContentByTag(node, 'tex-id') || 'a');
    this.weight.text = xmlDecoded(nodeContentByTag(node, 'weight'));
    if(IO_CONTEXT) IO_CONTEXT.rewrite(this.weight);
    this.comments = nodeContentByTag(node, 'notes');
    this.round_flags = safeStrToInt(nodeParameterValue(node, 'round-flags'));
  }
  
  rename(name) {
    // Change the name of this actor
    // NOTE: since version 1.3.2, colons are prohibited in actor names to
    // avoid confusion with prefixed entities; they are silently removed
    // to avoid model compatibility issues
    name = UI.cleanName(name).replace(':', '');
    if(!UI.validName(name)) {
      UI.warn(UI.WARNING.INVALID_ACTOR_NAME);
      return null;
    }
    // Create a new actor entry
    const
        a = MODEL.addActor(name),
        old_name = this.name,
        old_id = this.identifier;
    // Rename the current instance
    // NOTE: this object should persist, as many other objects refer to it
    this.name = a.name;
    // Put it in the "actor dictionary" of the model at the place of the newly
    // created instance (which should automatically be garbage-collected)
    MODEL.actors[a.identifier] = this;
    // Remove the old entry
    delete MODEL.actors[old_id];
    MODEL.replaceEntityInExpressions(old_name, this.name);
    MODEL.inferIgnoredEntities();
  }
  
  get defaultAttribute() {
    return 'CF';
  }

  attributeValue(a) {
    // Returns the computed result for attribute a (here always a vector)
    if(a === 'CF') return this.cash_flow;
    if(a === 'CI') return this.cash_in;
    if(a === 'CO') return this.cash_out;
    return null;
  }

  attributeExpression(a) {
    if(a === 'W') return this.weight;
    return null;
  }

  differences(a) {
    // Return "dictionary" of differences, or NULL if none
    const d = differences(this, a, UI.MC.ACTOR_PROPS);
    if(Object.keys(d).length > 0) return d;
    return null;
  }

} // END of class Actor


// CLASS ObjectWithXYWH (any drawable object)
class ObjectWithXYWH {
  constructor(cluster) {
    this.cluster = cluster;
    this.x = 0;
    this.y = 0;
    this.width = 0;
    this.height = 0;
    this.shape = UI.createShape(this);
  }

  alignToGrid() {
    // Align this object to the grid, and return TRUE if this involved
    // a move.
    const
        ox = this.x,
        oy = this.y;
    this.x = MODEL.aligned(this.x);
    this.y = MODEL.aligned(this.y);
    return Math.abs(this.x - ox) > VM.NEAR_ZERO ||
        Math.abs(this.y - oy) > VM.NEAR_ZERO;
  }
  
  move(dx, dy) {
    // Move this object by updating its x, y AND shape coordinates
    // (to avoid redrawing it)
    this.x += dx;
    this.y += dy;
    UI.moveShapeTo(this.shape, this.x, this.y);
  }
} // END of CLASS ObjectWithXYWH


// CLASS NoteField: numeric value of "field" [[variable]] in note text 
class NoteField {
  constructor(n, f, o, u='1', m=1, w=false, p='') {
    // `n` is the note that "owns" this note field
    // `f` holds the unmodified tag string [[dataset]] to be replaced by
    // the value of vector or expression `o` for the current time step;
    // if specified, `u` is the unit of the value to be displayed,
    // `m` is the multiplier for the value to be displayed, `w` is
    // the wildcard number to use in a wildcard equation, and `p` is
    // the prefix to use for a method equation.
    this.note = n;
    this.field = f;
    this.object = o;
    this.unit = u;
    this.multiplier = m;
    this.wildcard_number = (w ? parseInt(w) : false);
    this.prefix = p;
  }
  
  get value() {
    // Return the numeric value of this note field as a numeric string
    // followed by its unit (unless this is 1).
    // If object is the note, this means field [[#]] (note number context).
    // If this is undefined (empty string) display a double question mark.
    if(this.object === this.note) return this.note.numberContext || '\u2047';
    let v = VM.UNDEFINED;
    const t = MODEL.t;
    if(Array.isArray(this.object)) {
      // Object is a vector.
      if(t < this.object.length) v = this.object[t];
    } else if(this.object.hasOwnProperty('c') &&
        this.object.hasOwnProperty('u')) {
      // Object holds link lists for cluster balance computation.
      v = MODEL.flowBalance(this.object, t);
    } else if(this.object instanceof Expression) {
      // Object is an expression.
      this.object.method_object_prefix = this.prefix;
      v = this.object.result(t, this.wildcard_number);
    } else if(typeof this.object === 'number') {
      v = this.object;
    } else {
      // NOTE: this fall-through should not occur
      console.log('Note field value issue:', this.object);
    }
    if(Math.abs(this.multiplier - 1) > VM.NEAR_ZERO &&
        v > VM.MINUS_INFINITY && v < VM.PLUS_INFINITY) {
      v *= this.multiplier;
    }
    v = VM.sig4Dig(v);
    if(this.unit !== '1') v += ' ' + this.unit;
    return v;
  }
  
} // END of class NoteField


// CLASS Note
class Note extends ObjectWithXYWH {
  constructor(cluster) {
    super(cluster);
    const dt = new Date();
    // NOTE: Use timestamp in msec to generate a unique identifier.
    this.timestamp = dt.getTime();
    this.contents = '';
    this.lines = [];
    this.fields = [];
    this.parsed = false;
    this.color = new Expression(this, 'C', '');
  }
  
  get identifier() {
    return `#${this.cluster.identifier}#${this.timestamp}#`; 
  }

  get type() {
    return 'Note';
  }
  
  get clusterPrefix() {
    // Return the name of the cluster containing this note, followed
    // by a colon+space, except when this cluster is the top cluster.
    if(this.cluster === MODEL.top_cluster) return '';
    return this.cluster.displayName + UI.PREFIXER;
  }
  
  get displayName() {
    const
        n = this.number,
        type = (n ? `Numbered note #${n}` : 'Note');
    return `${this.clusterPrefix}${type} at (${this.x}, ${this.y})`;
  }
  
  get number() {
    // Return the number of this note if specified (e.g. as #123).
    // NOTE: This only applies to notes having note fields.
    const m = this.contents.replace(/\s+/g, ' ')
        .match(/^[^\]]*#(\d+).*\[\[[^\]]+\]\]/);
    if(m) return m[1];
    return '';
  }
  
  get numberContext() {
    // Return the string to be used to evaluate #. For notes, this is
    // their note number if specified, otherwise the number context of a
    // nearby node, and otherwise the number context of their cluster.
    let n = this.number;
    if(n) return n;
    n = this.nearbyNode;
    if(n) return n.numberContext;
    return this.cluster.numberContext;
  }
  
  get methodPrefix() {
    // Return the most likely candidate prefix to be used for method fields.
    const n = this.nearbyNode;
    if(n instanceof Cluster) return n.name;
    if(this.cluster === MODEL.top_cluster) return '';
    return this.cluster.name;
  }
  
  get nearbyNode() {
    // Return a node in the cluster of this note that is closest to this
    // note (Euclidian distance between center points), but with at most
    // 30 pixel units between their rims.
    const
        max_dist = 30,
        c = this.cluster,
        nodes = c.processes.concat(c.product_positions, c.sub_clusters);
    let nn = nodes[0] || null;
    if(nn) {
      let md = 1e+10;
      // Find the nearest node.
      for(let n of nodes) {
        if(n instanceof ProductPosition) n = n.product;
        const
            dx = (n.x - this.x),
            dy = (n.y - this.y),
            d = Math.sqrt(dx*dx + dy*dy);
        if(d < md) {
          nn = n;
          md = d;
        }
      }
      if(Math.abs(nn.x - this.x) < (nn.width + this.width) / 2 + max_dist &&
          Math.abs(nn.y - this.y) < (nn.height + this.height) / 2 + max_dist) return nn;
    }
    return null;
  }
  
  get asXML() {
    return ['<note><timestamp>', this.timestamp,
        '</timestamp><contents>', xmlEncoded(this.contents),
        '</contents><x-coord>', this.x,
        '</x-coord><y-coord>', this.y,
        '</y-coord><width>', this.width,
        '</width><height>', this.height,
        '</height><color>', this.color.asXML,
        '</color></note>'].join(''); 
  }
  
  initFromXML(node) {
    this.timestamp = safeStrToInt(nodeContentByTag(node, 'timestamp'));
    // NOTE: Legacy XML does not include the timestamp.
    if(!this.timestamp) {
      // For such notes, generate a 13-digit random number.
      this.timestamp = Math.floor((1 + Math.random()) * 1E12);
    }
    this.contents = xmlDecoded(nodeContentByTag(node, 'contents'));
    this.x = safeStrToInt(nodeContentByTag(node, 'x-coord'));
    this.y = safeStrToInt(nodeContentByTag(node, 'y-coord'));
    this.width = safeStrToInt(nodeContentByTag(node, 'width'));
    this.height = safeStrToInt(nodeContentByTag(node, 'height'));
    this.color.text = xmlDecoded(nodeContentByTag(node, 'color'));
    if(IO_CONTEXT) {
      for(const fe of this.fieldEntities) {
        this.rewriteTags(fe, IO_CONTEXT.actualName(fe));
      }
      IO_CONTEXT.rewrite(this.color);
    }
  }

  setCluster(c) {
    // Place this note into the specified cluster `c`.
    if(this.cluster) {
      // Remove this note from its current cluster's note list.
      const i = this.cluster.notes.indexOf(this);
      if(i >= 0) this.cluster.notes.splice(i, 1);
      // Set its new cluster pointer...
      this.cluster = c;
      // ... and add it to the new cluster's note list.
      if(c.notes.indexOf(this) < 0) c.notes.push(this);
    }
  }
  
  get tagList() {
    // Returns a list of matches for [[...]], or NULL if none.
    return this.contents.match(/\[\[[^\]]+\]\]/g);
  }
  
  parseFields() {
    // Fills the list of fields by parsing all [[...]] tags in the text.
    // NOTE: this does not affect the text itself; tags will be replaced
    // by numerical values only when drawing the note.
    
    // TO DO: Keep track whether this note associates itself with context node
    // so that it should remain aligned to this node.
    
    this.fields.length = 0;
    const tags = this.tagList;
    if(tags) for(const tag of tags) {
      const
          inner = tag.slice(2, tag.length - 2).trim(),
          bar = inner.lastIndexOf('|'),
          arrow = inner.lastIndexOf('->');
      // Special case: [[#]] denotes the number context of this note.
      if(inner === '#') {
        this.fields.push(new NoteField(this, tag, this));
        // Done, so move on to the next tag.
        continue;
      }
      // Check if a unit conversion scalar was specified.
      let ena,
          from_unit = '1',
          to_unit = '',
          multiplier = 1;
      if(arrow > bar) {
        // Now for sure it is entity->unit or entity|attr->unit.
        ena = inner.split('->');
        // As example, assume that unit = 'kWh' (so the value of the
        // field should be displayed in kilowatthour).
        // NOTE: Use .trim() instead of UI.cleanName(...) here. This
        // forces the modeler to be exact, and that permits proper
        // renaming of scale units in note fields.
        to_unit = ena[1].trim();
        ena = ena[0].split('|');
        if(!MODEL.scale_units.hasOwnProperty(to_unit)) {
          UI.warn(`Unknown scale unit "${to_unit}"`);
          to_unit = '1';
        }
      } else {
        ena = inner.split('|');
      }
      // Look up entity for name and attribute.
      let en = UI.colonPrefixedName(ena[0].trim(), this.clusterPrefix),
          id = UI.nameToID(en),
          // First try to match `id` with the IDs of wildcard equations,
          // (e.g., "abc 123" would match with "abc ??").
          w = MODEL.wildcardEquationByID(id),
          obj = null,
          wildcard = false;
      if(w) {
        // If wildcard equation match, w[0] is the equation (instance
        // of DatasetModifier), and w[1] the matching number.
        obj = w[0];
        wildcard = w[1];
      } else {
        obj = MODEL.objectByID(id);
      }
      // If not found, this may be due to # wildcards in the name.
      if(!obj && en.indexOf('#') >= 0) {
        // First try substituting # by the context number. 
        const numcon = this.numberContext;
        obj = MODEL.objectByName(en.replace('#', numcon));
        // If no match, check whether the name matches a wildcard equation.
        if(!obj) {
          obj = MODEL.equationByID(UI.nameToID(en.replace('#', '??')));
          if(obj) wildcard = numcon;
        }
      }
      if(!obj) {
        const m = MODEL.equations_dataset.modifiers[UI.nameToID(ena[0])];
        if(m) {
          const mp = this.methodPrefix;
          if(mp) {
            if(m.expression.isEligible(mp)) {
              this.fields.push(new NoteField(this, tag, m.expression, to_unit,
                  multiplier, false, mp));
            } else {
              UI.warn(`Prefix "${mp}" is not eligible for method "${m.selector}"`);
            }
          } else {
            UI.warn('Methods cannot be evaluated without prefix');
          }
        } else {
          UI.warn(`Unknown model entity "${en}"`);
        }
      } else if(obj instanceof DatasetModifier) {
        // NOTE: Equations are (for now) dimensionless => unit '1'.
        if(obj.dataset !== MODEL.equations_dataset) {
          from_unit = obj.dataset.scale_unit;
          multiplier = MODEL.unitConversionMultiplier(from_unit, to_unit);
        }
        this.fields.push(new NoteField(this, tag, obj.expression, to_unit,
            multiplier, wildcard));
      } else if(obj) {
        // If attribute omitted, use default attribute of entity type.
        const attr = (ena.length > 1 ? ena[1].trim() : obj.defaultAttribute);
        let val = null;
        // NOTE: For datasets, use the active modifier if no attribute.
        if(!attr && obj instanceof Dataset) {
          val = obj.activeModifierExpression;
        } else {
          // Variable may specify a vector-type attribute.
          val = obj.attributeValue(attr);
        }
        // If not, it may be a cluster unit balance.
        if(!val && attr.startsWith('=') && obj instanceof Cluster) {
          val = {c: obj, u: attr.substring(1).trim()};
          from_unit = val.u;
        }
        if(obj instanceof Dataset) {
          from_unit = obj.scale_unit;
        } else if(obj instanceof Product) {
          if(attr === 'L') {
            from_unit = obj.scale_unit;
          } else if(attr === 'CP' || attr === 'HCP') {
            from_unit = MODEL.currency_unit;
          }
        } else if(obj instanceof Link) {
          const node = (obj.from_node instanceof Process ?
              obj.to_node : obj.from_node);
          if(attr === 'F') {
            if(obj.multiplier <= VM.LM_MEAN) {
              from_unit = node.scale_unit;
            } else {
              from_unit = '1';
            }
          }
        } else if(['CI', 'CO', 'CF', 'MCF'].indexOf(attr) >= 0) {
          from_unit = MODEL.currency_unit;
        }
        // If still no value, `attr` may be an expression-type attribute.
        if(!val) {
          val = obj.attributeExpression(attr);
          // For wildcard expressions, provide the tail number of `attr`
          // as number context.
          if(val && val.isWildcardExpression) {
            const nr = matchingNumber(attr, val.attribute);
            if(nr) {
              wildcard = nr;
            } else {
              UI.warn(`Attribute "${attr}" does not provide a number`);
              continue;
            }
          }
          if(obj instanceof Product) {
            if(attr === 'IL' || attr === 'LB' || attr === 'UB') {
              from_unit = obj.scale_unit;
            } else if(attr === 'P') {
              from_unit = MODEL.currency_unit + '/' + obj.scale_unit;
            }
          }
        }
        // If no TO unit, add the FROM unit.
        if(to_unit === '') to_unit = from_unit;
        if(val) {
          multiplier = MODEL.unitConversionMultiplier(from_unit, to_unit);
          this.fields.push(new NoteField(this, tag, val, to_unit,
              multiplier, wildcard));
        } else {
          UI.warn(`Unknown ${obj.type.toLowerCase()} attribute "${attr}"`);
        }
      }
    }
    this.parsed = true;
  }

  get fieldEntities() {
    // Return a list with names of entities used in fields.
    const
        fel = [],
        tags = this.tagList;
    for(const tag of tags) {
      const
          // Trim brackets and padding spaces on both sides, and then
          // expand leading colons that denote prefixes.
          inner = UI.colonPrefixedName(tag.slice(2, tag.length - 2).trim()),
          vb = inner.lastIndexOf('|'),
          ua = inner.lastIndexOf('->');
      if(vb >= 0) {
        // Vertical bar? Then the entity name is the left part.
        addDistinct(inner.slice(0, vb), fel);
      } else if(ua >= 0 &&
          MODEL.scale_units.hasOwnProperty(inner.slice(ua + 2))) {
        // Unit arrow? Then trim the "->unit" part.
        addDistinct(inner.slice(0, ua), fel);
      } else {
        addDistinct(inner, fel);
      }
    }
    return fel;    
  }
  
  rewriteTags(en1, en2) {
    // Rewrite tags that reference entity name `en1` to reference `en2` instead.
    if(en1 === en2) return;
    const
        raw = en1.split(/\s+/).join('\\\\s+'),
        re = new RegExp('\\[\\[\\s*' + raw + '\\s*(\\->|\\||\\])', 'gi'),
        tags = this.contents.match(re);
    if(tags) for(const tag of tags) {
      this.contents = this.contents.replace(tag, tag.replace(en1, en2));
    }
  }
  
  rewriteFields(en1, en2) {
    // Rename fields that reference entity name `en1` to reference `en2`
    // instead.
    // NOTE: This does not affect the expression code.
    if(en1 === en2) return;
    for(const f of this.fields) {
      // Trim the double brackets and padding spaces on both sides.
      const tag = f.field.slice(2, f.field.length - 2).trim();
      // Separate tag into variable and attribute + offset string (if any).
      let e = tag,
          a = '',
          vb = tag.lastIndexOf('|'),
          ua = tag.lastIndexOf('->');
      if(vb >= 0) {
        e = tag.slice(0, vb);
        // NOTE: Attribute string includes the vertical bar '|'.
        a = tag.slice(vb);
      } else if(ua >= 0 && MODEL.scale_units.hasOwnProperty(tag.slice(ua + 2))) {
        e = tag.slice(0, ua);
        // NOTE: Attribute string includes the unit conversion arrow '->'.
        a = tag.slice(ua);
      }
      // Check for match.
      const r = UI.replaceEntity(e, en1, en2);
      if(r) {
        e = `[[${r}${a}]]`;
        this.contents = this.contents.replace(f.field, e);
        f.field = e;
      }
    }
  }
  
  get evaluateFields() {
    // Returns the text content of this note with all tags replaced
    // by their note field values.
    if(!this.parsed) this.parseFields();
    let txt = this.contents;
    for(const nf of this.fields) txt = txt.replace(nf.field, nf.value);
    return txt;
  }
  
  resize() {
    // Resizes the note; returns TRUE iff size has changed.
    let txt = this.evaluateFields;
    const
        w = this.width,
        h = this.height,
        // Minimumm note width of 10 characters.
        n = Math.max(txt.length, 10),
        fh = UI.textSize('hj').height;
    // Approximate the width to obtain a rectangle.
    // NOTE: 3:1 may seem exagerated, but characters are higher than wide,
    // and there will be more (short) lines due to newlines and wrapping.
    let tw = Math.ceil(3*Math.sqrt(n)) * fh / 2;
    this.lines = UI.stringToLineArray(txt, tw).join('\n');
    let bb = UI.textSize(this.lines, 8);
    // Aim to make the shape wider than tall.
    let nw = bb.width,
        nh = bb.height;
    while(bb.width < bb.height * 1.7) {
      tw *= 1.2;
      this.lines = UI.stringToLineArray(txt, tw).join('\n');
      bb = UI.textSize(this.lines, 8);
      // Prevent infinite loop.
      if(nw <= bb.width || nh > bb.height) break;
    }
    this.height = 1.05 * (bb.height + 6);
    this.width = bb.width + 6;
    // Boolean return value indicates whether size has changed.
    return this.width != w || this.height != h;
  }
  
  containsPoint(mpx, mpy) {
    // Returns TRUE iff given coordinates lie within the note rectangle.
    return (Math.abs(mpx - this.x) <= this.width / 2 &&
        Math.abs(mpy - this.y) <= this.height / 2);
  }

  copyPropertiesFrom(n, renumber=false) {
    // Sets properties to be identical to those of note `n`.
    this.x = n.x;
    this.y = n.y;
    let cont = n.contents;
    if(renumber) {
      // Renumbering only applies to notes having note fields; then the
      // note number must be denoted like #123, and occur before the first
      // note field.
      const m = cont.match(/^[^\]]*#(\d+).*\[\[[^\]]+\]\]/);
      if(m) {
        const nn = this.cluster.nextAvailableNoteNumber(m[1]);
        cont = cont.replace(/#\d+/, `#${nn}`);
      }
    }
    this.contents = cont;
    // NOTE: Renumbering does not affect the note fields or the color
    // expression. This is a design choice; the modeler can use wildcards.
    this.color.text = n.color.text;
    this.parsed = false;
  }

  differences(n) {
    // Return "dictionary" of differences, or NULL if none.
    const d = differences(this, n, UI.MC.NOTE_PROPS);
    if(Object.keys(d).length > 0) return d;
    return null;
  }

} // END of class Note


// CLASS NodeBox (superclass for clusters and nodes)
class NodeBox extends ObjectWithXYWH {
  constructor(cluster, name, actor) {
    super(cluster);
    this.name = name;
    this.actor = actor;
    this.name_lines = nameToLines(name, actor.name);
    this.comments = '';
    this.frame_width = 0;
    this.frame_height = 0;
    this.selected = false;
    this.hidden_inputs = [];
    this.hidden_outputs = [];
    this.hidden_io = [];
  }
  
  get hasActor() {
    return this.actor && (this.actor.name != UI.NO_ACTOR);
  }

  get displayName() {
    let n = this.name;
    if(n.startsWith(UI.BLACK_BOX)) n = n.replace(UI.BLACK_BOX_PREFIX);
    if(this.hasActor) return `${this.name} (${this.actor.name})`;
    return this.name;
  }
  
  get bindingsAsString() {
    if(!this.module) return '';
    const bk = Object.keys(this.module.bindings);
    if(bk.length) {
      const list = [pluralS(bk.length, 'binding') + ':'];
      for(const k of bk) {
        const b = this.module.bindings[k];
        list.push(`&#8227;&nbsp;${b.name_in_module}&nbsp;&rarrlp;&nbsp;${b.actual_name}`);
      }
      return list.join('\n');
    }
    return '(no bindings)';
  }
  
  get infoLineName() {
    // Return display name plus VM variable indices when debugging.
    let n = this.displayName;
    // NOTE: Display nothing if entity is "black-boxed".
    if(n.startsWith(UI.BLACK_BOX)) return '';
    n = `<em>${this.type}:</em> ${n}`;
    // For clusters, add how many processes and products they contain.
    if(this instanceof Cluster) {
      let dl = [];
      if(this.all_processes) {
        dl.push(pluralS(this.all_processes.length, 'process').toLowerCase());
        dl.push(pluralS(this.all_products.length, 'product').toLowerCase());
      }
      if(this.module) dl.push('included from <span class="mod-name" title="' +
          `${this.bindingsAsString}">${this.module.name}</span>`);
      if(dl.length) n += `<span class="node-details">${dl.join(', ')}</span>`;
    }
    if(!MODEL.solved) return n;
    const g = this.grid;
    if(g) {
      const
          ub = VM.sig4Dig(this.upper_bound.result(MODEL.t)),
          l = this.length_in_km,
          x = VM.sig4Dig(g.reactancePerKm * l, true),
          r = VM.sig4Dig(g.resistancePerKm * l, true),
          alr = VM.sig4Dig(this.actualLossRate(MODEL.t) * 100, true);
      n += ` [${g.name}] ${ub} ${g.power_unit}, ${l} km,` +
       `  x = ${x}, R = ${r}, loss rate = ${alr}%`;
    }
    if(DEBUGGING) {
      n += ' [';
      if(this instanceof Process || this instanceof Product) {
        n += this.level_var_index;
        if(this.on_off_var_index >= 0) {
          n += ', ' + this.on_off_var_index;
          if(this.start_up_var_index >= 0) {
            n += ', ' + this.start_up_var_index;
          }
        }
      }
      n += ']';
    }
    return n;
  }

  get identifier() {
    // Preserve names starting with an underscore (typically system variables)
    if(this.name.startsWith('_')) return UI.nameToID(this.name);
    // Otherwise, interpret underscores as hard spaces
    return UI.nameToID(this.displayName);
  }
  
  get numberContext() {
    // Returns the string to be used to evaluate #, so for clusters,
    // processes and products this is their "tail number".
    return UI.tailNumber(this.name);
  }
  
  get similarNumberedEntities() {
    // Returns a list of nodes of the same type that have a number
    // context similar to this node.
    const nc = this.numberContext;
    if(!nc) return [];
    const
        re = wildcardMatchRegex(this.displayName.replace(nc, '#')),
        nodes = MODEL.setByType(this.type),
        similar = [];
    for(let id in nodes) if(nodes.hasOwnProperty(id)) {
      const n = nodes[id];
      if(n.displayName.match(re)) similar.push(n);
    }
    return similar;
  }
  
  rename(name, actor_name) {
    // Changes the name and/or actor name of this node (process, product
    // or cluster).
    // NOTE: Returns TRUE if rename was successful, FALSE on error, and
    // a process, product or cluster if such entity having the new name
    // already exists.
    name = UI.cleanName(name);
    if(!UI.validName(name)) {
      UI.warningInvalidName(name);
      return false;
    }
    // Check whether a non-node entity has this name.
    const nne = MODEL.namedObjectByID(UI.nameToID(name));
    if(nne && nne !== this) {
      UI.warningEntityExists(nne);
      return false;
    }
    // Compose the full name.
    if(actor_name === '') actor_name = UI.NO_ACTOR;
    let fn = name;
    if(actor_name != UI.NO_ACTOR) fn += ` (${actor_name})`;
    // Get the ID (derived from the full name) and check if MODEL already
    // contains another entity with this ID.
    const
        old_name = this.displayName,
        old_id = this.identifier,
        new_id = UI.nameToID(fn),
        n = MODEL.nodeBoxByID(new_id);
    // If so, do NOT rename, but return this object instead.
    // NOTE: If entity with this name is THIS entity, it typically means
    // a cosmetic name change (upper/lower case) which SHOULD be performed.
    if(n && n !== this) return n;
    // Otherwise, if IDs differ, add this object under its new key, and
    // remove its old entry.
    if(old_id != new_id) {
      if(this instanceof Process) {
        MODEL.processes[new_id] = this;
        delete MODEL.processes[old_id];
      } else if(this instanceof Product) {
        MODEL.products[new_id] = this;
        delete MODEL.products[old_id];
      } else if(this instanceof Cluster) {
        MODEL.clusters[new_id] = this;
        delete MODEL.clusters[old_id];
      } else {
        // NOTE: This should never happen => report an error.
        UI.alert('Can only rename processes, products and clusters');
        return false;
      }
    }
    // Change this object's name and actor.
    this.actor = MODEL.addActor(actor_name);
    this.name = name;
    // Ensure that actor cash flow data products have valid properties
    if(this.name.startsWith('$')) {
      this.scale_unit = MODEL.currency_unit;
      this.initial_level.text = '';
      this.price.text = '';
      this.is_data = true;
      this.is_buffer = false;
      this.integer_level = false;
    }
    // Update actor list in case some actor name is no longer used.
    MODEL.cleanUpActors();
    MODEL.replaceEntityInExpressions(old_name, this.displayName);
    MODEL.inferIgnoredEntities();
    // NOTE: Renaming may affect the node's display size.
    if(this.resize()) UI.drawSelection(MODEL);
    // NOTE: Only TRUE indicates a successful (cosmetic) name change.
    return true;
  }
  
  resize() {
    // Resize this node; returns TRUE iff size has changed.
    // Therefore, keep track of original width and height.
    const
        ow = this.width,
        oh = this.height,
        an = (this.hasActor ? this.actor.name : '');
    this.name_lines = nameToLines(this.name, an);
    this.bbox = UI.textSize(this.name_lines, this instanceof Cluster ? 12 : 10);
    let w = Math.max(40, this.bbox.width, UI.textSize(an).width);
    if(this instanceof Product) {
      w = Math.max(w, UI.textSize(`[${this.scale_unit}]`).width);
    }
    this.frame_width = w + 7;
    // Add 17 pixels height for actor name.
    this.height = Math.max(50, this.bbox.height + 17);
    if(this instanceof Process) {
      this.width = Math.max(90, this.frame_width + 20);
      this.height = Math.max(60, this.height + 15);
    } else if(this instanceof Cluster) {
      this.width = Math.max(
          CONFIGURATION.min_cluster_size, this.frame_width + 20);
      // Clusters have a square shape.
      this.height = Math.max(this.width, this.height); 
    } else {
      this.height += 8;
      // Reserve some extra space for UB/LB if defined.
      if(this.lower_bound.defined || this.upper_bound.defined) {
        this.frame_width += 16;
      }
      this.width = this.frame_width + this.height - 1;
    }
    return this.width != ow || this.height != oh;
  }

  containsPoint(mpx, mpy) {
    const dmpx = mpx - this.x, dmpy = mpy - this.y;
    if(this instanceof Process && this.collapsed) {
      return Math.abs(dmpx) < 9 && Math.abs(dmpy) < 7;
    }
    if(this instanceof Cluster && this.collapsed) {
      return Math.abs(dmpx) < 12 && Math.abs(dmpy) < 12;
    }
    if(Math.abs(dmpx) > this.width/2 || Math.abs(dmpy) > this.height/2) {
      return false;
    }
    if(!(this instanceof Product)) return true;
    if(mpx < this.x) {
      const cx = this.x - this.frame_width / 2;
      return mpx >= cx ||
          (mpx - cx)*(mpx - cx) + dmpy*dmpy <= this.height * this.height / 4;
    }
    const cx = this.x + this.frame_width / 2;
    return mpx <= cx ||
        (mpx - cx)*(mpx - cx) + dmpy*dmpy <= this.height * this.height / 4;
  }
  
  drawWithLinks() {
    const fc = this.cluster;
    // Do not redraw if this node is not visible in the focal cluster.
    if(this instanceof Product) {
      if(!this.positionInFocalCluster) return;
    } else {
      if(fc !== MODEL.focal_cluster) return;
    }
    UI.drawObject(this);
    // @@TO DO: Also draw relevant arrows when this is a cluster.
    if(this instanceof Cluster) return;
    // Draw all *visible* arrows associated with this node.
    fc.categorizeEntities();
    // Make list of arrows that represent a link related to this node.
    const alist = [];
    for(const a of fc.arrows) {
      for(const l of this.inputs) {
        if(a.links.indexOf(l) >= 0 && alist.indexOf(a) < 0) {
          alist.push(a);
        }
      }
      for(const l of this.outputs) {
        if(a.links.indexOf(l) >= 0 && alist.indexOf(a) < 0) {
          alist.push(a);
        }
      }
    }
    // Draw all arrows in this list.
    for(const a of alist) UI.drawObject(a);
    // Also draw related constraint arrows.
    for(let k in MODEL.constraints) if(MODEL.constraints.hasOwnProperty(k)) {
      const c = MODEL.constraints[k];
      if(c.from_node === this || c.to_node === this) UI.drawObject(c);
    }
  }
  
  clearHiddenIO() {
    this.hidden_inputs.length = 0;
    this.hidden_outputs.length = 0;
    this.hidden_io.length = 0;
  }
  
} // END of class NodeBox


// CLASS Arrow
// NOTE: Each instance of Arrow will be drawn as ONE arrow, or as block arrows.
// If a link requires several arrows to be drawn (typically between clusters),
// these each have their "own" entry in the `arrows` attribute of the focal
// cluster.
class Arrow {
  constructor(link, from, to) {
    this.links = [link];
    // NOTES:
    // (1) FROM and TO may be clusters, so they cannot be inferred from `link`.
    // (2) Either FROM or TO may be NULL if it is a process outside the focal
    //     cluster, or if FROM is a product NOT produced in the cluster, or
    //     if TO is a product NOT consumed in the cluster; such NULL arrows are
    //     represented by block arrows on the node, and may have multiple links.
    this.from_node = from;
    this.to_node = to;
    this.bidirectional = false;
    // The following attributes are calculated while drawing.
    this.from_x = 0;
    this.from_y = 0;
    this.to_x = 0;
    this.to_y = 0;
    // For multi-link arrows, the list of nodes that are NOT displayed.
    this.hidden_nodes = [];
    // Arrows are drawn as a shape, similar to nodes.
    this.shape = UI.createShape(this);
  }
  
  get hasComments() {
    // Return TRUE iff documentation hass been added for this arrow.
    for(const l of this.links) if(l.comments) return true;
    return false;
  }
  
  get multiFlows() {
    // In some cases, distinct flows can also be computed for a composite
    // arrow: (1) when its TO node is a product in the focal cluster,
    // and the FROM node is a sub-cluster, or vice versa; in that case,
    // the arrow is unidirectional, and the flow is the sum of flows
    // over all links; (2) when both FROM and TO are clusters, and the
    // links composing this arrow all consume the same product P, or all
    // produce the same product P, or all either produce P1 or consume P2.

    // Return a tuple [status, tail_flow, head_flow, tail_at_ub, head_at_ub]
    // where status can be:
    //   0: no flows (model not computed)
    //   1: no distinct flows (but arrow may have active links)
    //   2: single aggregated flow (for monodirectional arrow)
    //   3: two aggregated flows (for bidirectional arrows)
    // tail_flow is the sum of link flows for P1 that is (or is contained in)
    // the FROM node of this arrow;
    // head_flow is the sum of link flows for P2 that is (or is contained in)
    // the TO node;
    // tail_at_ub is TRUE iff one or more links P1 --> Q are constrained by the
    // UB of their process Q;
    // head_at_ub is TRUE iff one or more links Q --> P2 are constrained by the
    // UB of their process Q.

    if(!MODEL.solved) return [0, 0, 0, false, false];
    let p = [null, null],
        pi,
        one_flow = [true, true],
        at_ub = [false, false],
        total = 0,
        sum = [0, 0],
        out = [0, 0];
    for(const l of this.links) {
      const af = l.actualFlow(MODEL.t);
      total += af;
      if(l.from_node instanceof Product) {
        // NOTE: Flow OUT of this product P.
        const
            n = l.to_node,
            pl = n.actualLevel(MODEL.t),
            lb = n.lower_bound.result(MODEL.t),
            ub = (n.equal_bounds ? lb : n.upper_bound.result(MODEL.t));
        // Let product index `pi` be 0 if link has FROM product FP equal
        // to this arrow's tail product P ...
        pi = (l.from_node === this.from_node ||
            // ... or if this arrow's tail is a cluster ...
            (this.from_node instanceof Cluster &&
                // ... but then FP should be ONLY in this cluster, and
                // NOT ALSO in this arrow's head cluster (if it has a
                // head cluster) as then the flow actually occurs to
                // this head cluster, and hence `pi` should be 1 to
                // denote "head flow"
                !(this.to_node instanceof Cluster &&
                    this.to_node.containsProduct(l.from_node))) ? 0 : 1);
        // NOTE: Only links in/out of a process can be "congested".
        if(pl >= ub) at_ub[pi] = n instanceof Process;
        if(!p[pi]) {
          p[pi] = l.from_node;
          out[pi] += af;
          // OUTflow, so subtract for sum
          sum[pi] -= af;
        } else if(l.from_node !== p[pi]) {
          one_flow[pi] = false;
          // "quick fix" for product-to-product dataflows from cluster-
          // to-product arrow
          if(n instanceof Product) out[pi] += af;
        } else {
          out[pi] += af;
          // OUTflow, so subtract from sum
          sum[pi] -= af;
        }
      } else if(l.to_node instanceof Product) {
        // NOTE: flow INto this product
        const
            n = l.from_node,
            pl = n.actualLevel(MODEL.t),
            lb = n.lower_bound.result(MODEL.t),
            ub = (n.equal_bounds ? lb : n.upper_bound.result(MODEL.t));
        pi = (l.to_node === this.from_node ||
            // NOTE: same complex reasoning as explained above
            (this.from_node instanceof Cluster &&
                !(this.to_node instanceof Cluster &&
                    this.to_node.containsProduct(l.to_node))) ? 0 : 1);
        // AGAIN: only links in/out of a process can be "congested"
        if(pl >= ub) at_ub[pi] = n instanceof Process;
        if(!p[pi]) {
          p[pi] = l.to_node;
          // INflow, so add
          sum[pi] += af;
        } else if(l.to_node !== p[pi]) {
          one_flow[pi] = false;
        } else {
          // INflow, so add
          sum[pi] += af;
        }
      }
    }
    if(Math.abs(total) < VM.NEAR_ZERO) total = 0;
    if(!(one_flow[0] || one_flow[1])) {
      // No distinct flows => return total flow
      return [1, total, 0, at_ub[0] || at_ub[1], false];
    }
    // Now we have either one or two distinct flows
    // First truncate when very close to zero
    if(Math.abs(sum[0]) < VM.NEAR_ZERO) sum[0] = 0;
    if(Math.abs(sum[1]) < VM.NEAR_ZERO) sum[1] = 0;
    if(Math.abs(out[0]) < VM.NEAR_ZERO) out[0] = 0;
    if(Math.abs(out[1]) < VM.NEAR_ZERO) out[1] = 0;
    // At most 1 product, or 2 if the arrow is bidirectional
    let status = 0;
    if(this.bidirectional) {
      status = (one_flow[0] && one_flow[1] ? 3 :
          (one_flow[0] || one_flow[1] ? 2 : 1));
    } else {
      if(p[0] && p[1]) {
        console.log('ERROR: Two distinct flows on monodirectional arrow',
            this, sum, p);
        return [0, 0, 0, false, false];
      }
      status = 1;
    }
    // Special case: a mono-directional arrow between two sub-clusters
    // for which the product P involved has a position in BOTH clusters.
    // In this case, the sum of flows for P will equal 0 (unless P has
    // storage!) while there actually is a flow from one cluster to the
    // other. Therefore, check whether sum-of-flows differs from the
    // computed total flow, and if so, use the outflow, as what is added
    // to the stock does not flow from cluster to cluster.
    if(status === 1) {
      const pi = (p[0] ? 0 : 1);
      if(sum[pi] !== total && out[pi] !== 0) {
        return [status, out[pi], 0, at_ub[pi], false];
      }
    }
    // NOTE: when p[1] is NULL in bidirectional flow, this may indicate
    // a reverse flow, so check whether the values must be swapped
    if(p[1] === null) {
      const p0 = p[0];
      // Links of this arrow will be either INputs our OUTputs of p[0],
      // so calculate the balance of INflows and OUTflows
      let flow = 0;
      for(const l of this.links) {
        if(p0.inputs.indexOf(l) >= 0) {
          const af = l.actualFlow(MODEL.t);
          if(Math.abs(af) > VM.NEAR_ZERO) flow += af;
        } else if(p0.outputs.indexOf(l) >= 0) {
          const af = l.actualFlow(MODEL.t);
          if(Math.abs(af) > VM.NEAR_ZERO) flow -= af;
        }
      }
      // For tail flow, sum of flows should equal sum[0] ...
      const is_tail_flow = Math.abs(flow - sum[0]) < VM.NEAR_ZERO;
      // ... but not when p0 is the TO node (and m.m. for FROM node)
      if(is_tail_flow && p0 === this.to_node ||
          !is_tail_flow && p0 === this.from_node) {
        // If not, the flow is inversed
        // But if flow is negative, do not swap but negate
        if(flow < 0) {
          return [status, -sum[0], sum[1], at_ub[0], at_ub[1]];
        }
        return [status, sum[1], sum[0], at_ub[1], at_ub[0]];
      }
      // If NOT inverse flow, but flow < 0, swap AND negate
      if(flow < 0) {
        return [status, sum[1], -sum[0], at_ub[1], at_ub[0]];
      }
    }
    return [status, sum[0], sum[1], at_ub[0], at_ub[1]]; 
  }
  
  containsPoint(mpx, mpy) {
    // Returns the LINK under the cursor point, or NULL
    let dx = this.to_x - this.from_x;
    // Avoid division by 0
    if(dx === 0) dx = 0.1;
    const dy = this.to_y - this.from_y,
          l2 = dx*dx + dy*dy,
          mu = ((mpy - this.from_y)*dx - (mpx - this.from_x)*dy) / l2,
          lambda = (mpx + mu*dy - this.from_x) / dx;
    // NOTE: lambda is the relative distance that the cursor is up the shaft
    // use about 2.5 (= sqrt(8)) pixels margin to consider the cursor "on" the shaft
    if(lambda < 0 || lambda > 1 || mu*mu*(dx*dx + dy*dy) > 8) {
      return null;
    }
    // If single-link arrow, return the link
    if(this.links.length === 1) {
      return this.links[0];
    }
    // If more links, display them in Documentation dialog (GUI only) ...
    if(DOCUMENTATION_MANAGER) DOCUMENTATION_MANAGER.showArrowLinks(this);
    // ... and do not allow selection of a specific link
    return null;
  }

} // END of class Arrow

// CLASS Cluster
class Cluster extends NodeBox {
  constructor(cluster, name, actor) {
    super(cluster, name, actor);
    this.module = null;
    this.processes = [];
    this.product_positions = [];
    this.sub_clusters = [];
    this.notes = [];
    this.collapsed = false;
    // Flag to indicate that processes and their related links, as well as
    // products unique to this cluster must be left out from the optimization
    this.ignore = false;
    // Flag to indicate that this cluster is to be stored as "black box"
    this.black_box = false;
    // Flag to indicate that this cluster is "black-boxed" and cannot be edited
    this.is_black_boxed = false;
    // Slack uses tallies per time step the number of non-zero slack variables
    this.slack_info = {};
    // Clusters have 3 result attributes: CF, CI and CO
    this.cash_flow = [];
    this.cash_in = [];
    this.cash_out = [];
    // The following properties are used for fast link drawing
    // NOTE: if all_processes is NULL, these properties need to be recalculated
    this.all_processes = null;
    this.all_products = [];
    this.related_links = [];
    this.related_constraints = [];
    this.arrows = [];
    this.consumed_products = [];
    this.produced_products = [];
    this.internal_products = [];
    this.io_products = [];
  }

  get type() {
    return 'Cluster';
  }

  get typeLetter() {
    return 'C';
  }

  get attributes() {
    const a = {name: this.displayName};
    if(MODEL.solved) {
      const t = MODEL.t;
      a.CF = this.cash_flow[t];
      a.CI = this.cash_in[t];
      a.CO = this.cash_out[t];
    }
    return a;
  }
  
  get nestingLevel() {
    // Return the "depth" of this cluster in the cluster hierarchy.
    if(this.cluster) return this.cluster.nestingLevel + 1; // recursion!
    return 0;
  }
  
  get toBeIgnored() {
    // Return TRUE if this cluster or some parent cluster is set to be ignored.
    return this.ignore || MODEL.ignoreClusterInThisRun(this) ||
        (this.cluster && this.cluster.toBeIgnored); // recursion!
  }
  
  get blackBoxed() {
    // Return TRUE if this cluster or some parent cluster is marked as black box.
    return this.black_box ||
        (this.cluster && this.cluster.blackBoxed); // recursion!
  }
  
  get toBeBlackBoxed() {
    return (this.is_black_boxed || MODEL.black_box && this.blackBoxed); 
  }
  
  get blackBoxName() {
    // Return prefixed name if "black boxing" and this cluster is not already
    // "black-boxed" and some parent cluster is marked as black box.
    if(MODEL.black_box && !this.is_black_boxed &&
        this.cluster && this.cluster.blackBoxed) {
      return UI.BLACK_BOX_PREFIX + this.name;
    }
    return this.name;
  }

  get rightMarginX() {
    // Return the horizontal position of the right-most edge of the right-most
    // node in the diagram for this cluster.
    let max = 0;
    for(const n of this.notes) max = Math.max(max, n.x + n.width / 2);
    for(const p of this.processes) max = Math.max(max, p.x + p.width / 2);
    for(const c of this.sub_clusters) max = Math.max(max, c.x + c.width / 2);
    for(const p of this.product_positions) max = Math.max(max, p.x + p.product.width / 2);
    return max;
  }
  
  get defaultAttribute() {
    return 'CF';
  }

  attributeValue(a) {
    // Return the computed result for attribute `a`.
    // For clusters, this is always a vector.
    if(a === 'CF') return this.cash_flow;
    if(a === 'CI') return this.cash_in;
    if(a === 'CO') return this.cash_out;
    return null;
  }
  
  attributeExpression() {
    // Clusters have no attribute expressions => always return null.
    return null;
  }
  
  get moduleAsXML() {
    if(!this.module) return '';
    const xml = ['<module name="', xmlEncoded(this.module.name), '">'];
    for(const k of Object.keys(this.module.bindings)) {
      xml.push(this.module.bindings[k].asXML);
    }
    xml.push('</module>');
    return xml.join('');
  }

  get asXML() {
    let xml;
    const
        cmnts = xmlEncoded(this.comments),
        flags = (this.collapsed ? ' collapsed="1"' : '') +
            (this.ignore ? ' ignore="1"' : '') +
            (this.black_box ? ' black-box="1"' : '') +
            (this.toBeBlackBoxed ? ' is-black-boxed="1"' : '');
    xml = ['<cluster', flags, '><name>', xmlEncoded(this.blackBoxName),
        '</name><owner>', xmlEncoded(this.actor.name),
        '</owner>', this.moduleAsXML,
        '<x-coord>', this.x,
        '</x-coord><y-coord>', this.y,
        '</y-coord><comments>', cmnts,
        '</comments><process-set>'].join('');
    for(const p of this.processes) {
      let n = p.displayName;
      const id = UI.nameToID(n);
      if(MODEL.black_box_entities.hasOwnProperty(id)) {
        n = MODEL.black_box_entities[id];
      }
      xml += '<process-name>' + xmlEncoded(n) + '</process-name>';
    }
    xml += '</process-set>';
    // NOTE: Product positions and notes are not saved in a "black box".
    if(!this.toBeBlackBoxed) {
      xml += '<product-positions>';
      for(const pp of this.product_positions) xml += pp.asXML;
      xml += '</product-positions><notes>';
      for(const n of this.notes) xml += n.asXML;
      xml += '</notes>';
    }
    // NOTE: Save sub-clusters AFTER product positions, as PP coordinates
    // may change when saving sub-clusters -- @@TO DO: find out where/why!
    xml += '<sub-clusters>';
    // NOTE: Recursive call will capture entire sub-cluster hierarchy.
    for(const c of this.sub_clusters) xml += c.asXML;
    xml += '</sub-clusters>';
    return xml + '</cluster>';
  }
  
  initFromXML(node) {
    this.x = safeStrToInt(nodeContentByTag(node, 'x-coord'));
    this.y = safeStrToInt(nodeContentByTag(node, 'y-coord'));
    this.comments = xmlDecoded(nodeContentByTag(node, 'comments'));
    this.collapsed = nodeParameterValue(node, 'collapsed') === '1';
    this.ignore = nodeParameterValue(node, 'ignore') === '1';
    this.black_box = nodeParameterValue(node, 'black-box') === '1';
    this.is_black_boxed = nodeParameterValue(node, 'is-black-boxed') === '1';
        
    let name,
        actor,
        n = childNodeByTag(node, 'module');
    if(n) {
      this.module = {
          name: xmlDecoded(nodeParameterValue(n, 'name')),
          bindings: {}
        };
      for(const c of n.childNodes) if(c.nodeName === 'iob') {
        const
            iot = parseInt(nodeParameterValue(c, 'type')),
            et = capitalized(VM.entity_names[nodeParameterValue(c, 'entity')]),
            iob = new IOBinding(iot, et,
                nodeParameterValue(c, 'data') === '1',
                xmlDecoded(nodeParameterValue(c, 'name')));
        iob.actual_name = nodeContent(c);
        this.module.bindings[iob.id] = iob;
      }
    }
    n = childNodeByTag(node, 'process-set');
    // NOTE: To compensate for a shameful bug in an earlier version, look
    // for "product-positions" node and for "notes" node in the process-set,
    // as it may have been put there instead of in the cluster node itself.
    const
        hidden_pp = childNodeByTag(n, 'product-positions'),
        hidden_notes = childNodeByTag(n, 'notes');
    // If they exist, these nodes will be used a bit further down.
    if(n) {
      for(const c of n.childNodes) if(c.nodeName === 'process-name') {
        name = xmlDecoded(nodeContent(c));
        if(IO_CONTEXT) {
          const an = name.split(' (');
          if(an.length > 1) {
            const
                a = an.pop().slice(0, -1),
                p = an.join(' ('),
                aan = IO_CONTEXT.actualName(a),
                aaid = UI.nameToID(aan);
            // Check that actor exists, as (...) may just be part of the name.
            if(MODEL.actorByID(aaid)) { 
              name = IO_CONTEXT.actualName(p, a) + ` (${aan})`;
            } else {
              name = IO_CONTEXT.actualName(name);
            }
          } else {
            name = IO_CONTEXT.actualName(name);
          }
        }
        const p = MODEL.nodeBoxByID(UI.nameToID(name));
        if(p) p.setCluster(this);
      }
    }
    n = childNodeByTag(node, 'sub-clusters');
    if(n) {
      for(const c of n.childNodes) if(c.nodeName === 'cluster') {
        // Refocus on this cluster because addCluster may change focus if it
        // contains subclusters.
        MODEL.focal_cluster = this;
        // NOTE: addCluster will then cause recursion by calling the method
        // `initFromXML` again.
        name = xmlDecoded(nodeContentByTag(c, 'name'));
        actor = xmlDecoded(nodeContentByTag(c, 'owner'));
        if(IO_CONTEXT) {
          actor = IO_CONTEXT.actualName(actor);
          name = IO_CONTEXT.actualName(name);
        }
        MODEL.addCluster(name, actor, c);
      }
    }
    // NOTE: the part " || hidden_pp" is to compensate for a bug -- see earlier note.
    n = childNodeByTag(node, 'product-positions') || hidden_pp;
    if(n) {
      for(const c of n.childNodes) if(c.nodeName === 'product-position') {
        name = xmlDecoded(nodeContentByTag(c, 'product-name'));
        if(IO_CONTEXT) name = IO_CONTEXT.actualName(name);
        const p = MODEL.nodeBoxByID(UI.nameToID(name));
        if(p) this.addProductPosition(p).initFromXML(c);
      }
    }
    n = childNodeByTag(node, 'notes') || hidden_notes;
    if(n) {
      for(const c of n.childNodes) if(c.nodeName === 'note') {
        const note = new Note(this);
        note.initFromXML(c);
        this.notes.push(note);
      }
    }
  }
  
  onEdge(mpx, mpy) {
    // Return TRUE if (x, y) is in right or bottom edge (15% band)
    let dx = mpx - this.x,
        dy = mpy - this.y;  
    if(this.collapsed) {
      return dy <= 16 && dx <= 16 &&
          (dx >= 9 && dy >= -12  || dx >= -12 && dy >= 9);
    }
    dx -= 0.4 * this.width;
    dy -= 0.4 * this.height;  
    return dx > 0 && dx < 0.1 * this.width || dy > 0 && dy < 0.1 * this.height;    
  }

  containsCluster(c) {
    while(c && c !== this) c = c.cluster;
    return c !== null;
  }

  setCluster(c) {
    // Place this cluster into the specified cluster `c`
    // NOTE: cluster = NULL for the top cluster; this should never be altered
    // NOTE: cluster cannot have itself as parent
    if(this.cluster && c !== this) {
      // Remove this cluster from its current parent's sub-cluster list
      const i = this.cluster.sub_clusters.indexOf(this);
      if(i >= 0) this.cluster.sub_clusters.splice(i, 1);
      // Set its new parent cluster pointer...
      this.cluster = c;
      // ... and add it to the new parent cluster's sub-cluster list
      if(c.sub_clusters.indexOf(this) < 0) c.sub_clusters.push(this);
    }
  }
  
  indexOfProduct(p) {
    // Returns the last position of product `p` in this cluster
    let i = this.product_positions.length - 1;
    while(i >= 0 && this.product_positions[i].product !== p) i--;
    return i;
  }

  addProductPosition(p, x=null, y=null) {
    // Add a product position for product `p` to this cluster unless such
    // "pp" already exists, and then return this (new) product position.
    let pp = this.indexOfProduct(p);
    if(pp >= 0) {
      pp = this.product_positions[pp];
    } else {
      pp = new ProductPosition(this, p);
      if(x && y) {
        pp.x = x;
        pp.y = y;
      }
      this.product_positions.push(pp);
      // Prepare for redraw
      this.clearAllProcesses();
    }
    return pp;
  }

  containsProduct(p) {
    // Return the subcluster of this cluster that contains product `p`,
    // or NULL if `p` does not occur in this cluster.
    if(this.indexOfProduct(p) >= 0) return this;
    for(const c of this.sub_clusters) {
      if(c.containsProduct(p)) return c; // recursion!
    }
    return null;
  }

  containsProcess(p) {
    // Return the subcluster of this cluster that contains process `p`, or null.
    if(p.cluster === this) return this;
    for(const c of this.sub_clusters) {
      if(c.containsProcess(p)) return c; // recursion!
    }
    return null;
  }

  get allProcesses() {
    // Return the set of all processes in this cluster and its subclusters.
    let procs = this.processes.slice();
    for(const c of this.sub_clusters) {
      procs = procs.concat(c.allProcesses); // recursion!
    }
    return procs;
  }

  get allProducts() {
    // Return the set of all products positioned in this cluster or
    // one or more of its subclusters.
    let prods = [];
    for(const pp of this.product_positions) addDistinct(pp.product, prods);
    for(const c of this.sub_clusters) {
      mergeDistinct(c.allProducts, prods); // recursion!
    }
    return prods;
  }
  
  get allNotes() {
    // Return the set of all notes in this cluster and its subclusters.
    let notes = this.notes.slice();
    for(const c of this.sub_clusters) {
      notes = notes.concat(c.allNotes); // recursion!
    }
    return notes;
  }

  resetNoteFields() {
    // Ensure that all note fields are parsed anew when a note in this
    // cluster is drawn.
    for(const n of this.notes) n.parsed = false;
  }

  nextAvailableNoteNumber(n) {
    // Return the first integer greater than `n` that is not already in use
    // by a note of this cluster.
    let nn = parseInt(n) + 1;
    const nrs = [];
    for(const n of this.notes) {
      const nr = n.number;
      if(nr) nrs.push(parseInt(nr));
    }
    while(nrs.indexOf(nn) >= 0) nn++;
    return nn;
  }

  clearAllProcesses() {
    // Clear `all_processes` property of this cluster AND of all its parent clusters.
    this.all_processes = null;
    if(this.cluster) this.cluster.clearAllProcesses(); // recursion!
  }
  
  usesSlack(t, p, slack_type) {
    // Add slack-using product `p` to slack info for this cluster.
    // NOTE: When diagnosing an unbounded problem, `p` can also be a
    // process with an infinite level.
    let s;
    if(t in this.slack_info) {
      s = this.slack_info[t];
    } else {
      s = {LE: [], GE: []};
      this.slack_info[t] = s;
    }
    addDistinct(p, s[slack_type]);
    // NOTE: Recursive call to let the slack use info "bubble up".
    if(this.cluster) this.cluster.usesSlack(t, p, slack_type);
  }

  indexOfArrow(from, to) {
    // Return the index of the first arrow in this cluster having the
    // specified `from` and `to` nodes
    // NOTE: there should be no more than one such arrow, but this is
    // not checked
    for(let index = 0; index < this.arrows.length; index++) {
      const a = this.arrows[index];
      // NOTE: The direction of the arrow is irrelevant.
      if((a.from_node === from && a.to_node === to) ||
          (a.from_node === to && a.to_node === from)) return index;
    }
    return -1;
  }

  addArrow(link, q_node=null, p_node=null, p_to_q=false) {
    // Add a new arrow to the arrow list, or updates an existing arrow
    // to include the link specified by `link`.
    let a;
    // If only the link is passed, it is a plain arrow (although it may
    // be "data-only" and drawn as dashed arrow P --> P).
    if(q_node === null && p_node === null) {
      // A plain arrow is always unique => add a new instance.
      a = new Arrow(link, link.from_node, link.to_node);
      this.arrows.push(a);
      return a;
    }
    // See if an arrow between the two nodes already exists.
    const ai = this.indexOfArrow(q_node, p_node);
    if(ai >= 0) {
      // If so, get it, and add the link to its set unless it is already there.
      a = this.arrows[ai];
      addDistinct(link, a.links);
      // Check whether this makes the arrow bidirectional.
      // NOTE: "hidden" arrows can also be bi-directional; these are
      // represented by a gray block arrow at the top of their cluster.
      if(!a.bidirectional) {
        a.bidirectional = (p_to_q ? p_node !== a.from_node : q_node !== a.from_node);
      }
      return a;
    }
    // If not, create a new instance.
    // NOTE: The from-node and to-node that were passed to the constructor
    // define the arrow direction.
    if(p_to_q) {
      a = new Arrow(link, p_node, q_node);
    } else  {
      a = new Arrow(link, q_node, p_node);
    }
    this.arrows.push(a);
    return a;
  }
  
  selectedArrows() {
    // Return list of arrows that connect to selected nodes.
    const sa = [];
    for(const a of this.arrows) {
      if((a.from_node && a.from_node.selected) ||
          (a.to_node && a.to_node.selected)) sa.push(a);
    }
    return sa.slice();
  }
  
  categorizeEntities() {
    // Infer the following properties (lists) for this cluster:
    // (1) all_processes: processes in this cluster and its subclusters;
    // (2) consumed_products: products that are input for some of these processes;
    // (3) produced_products: products that are output for some of these processes;
    // (4) internal_products: products that do NOT occur somewhere outside this cluster
    // (5) io_products: the intersection (i.e., without duplicates) of (2) and (3) minus (4)
    // (6) related_links: the subset of links that relate to this cluster
    // (7) related_constraints: the subset of constraints that relate to this cluster
    // (8) arrows: the set of arrows to be displayed for this cluster
    // These cluster properties need to be recomputed only after adding/deleting
    // nodes, links or constraints. These add/delete routines set the all_processes
    // property of all affected clusters to NULL, hence the first IF statement below.
    if(this.all_processes !== null) return;
    this.all_processes = this.allProcesses;
    this.all_products = this.allProducts;
    this.consumed_products.length = 0;
    this.produced_products.length = 0;
    this.internal_products.length = 0;
    this.io_products.length = 0;
    this.related_links.length = 0;
    this.related_constraints.length = 0;
    this.arrows.length = 0;
    // Iterate over all links in the model
    for(let l in MODEL.links) if(MODEL.links.hasOwnProperty(l)) {
      const lnk = MODEL.links[l];
      if(this.all_processes.indexOf(lnk.from_node) >= 0) {
        // Link FROM some process in this cluster
        this.related_links.push(lnk);
        addDistinct(lnk.to_node, this.produced_products);
      } else if(this.all_processes.indexOf(lnk.to_node) >= 0) {
        // Link TO some process in this cluster
        this.related_links.push(lnk);
        addDistinct(lnk.from_node, this.consumed_products);
      } else if(lnk.from_node instanceof Process) {
        // Link  FROM "external" process
        const tpi = this.indexOfProduct(lnk.to_node);
        if(tpi >= 0) this.related_links.push(lnk);
      } else if(lnk.to_node instanceof Process) {
        // Link  TO "external" process
        const fpi = this.indexOfProduct(lnk.from_node);
        if(fpi >= 0) this.related_links.push(lnk);
      } else {
        // Data-only link P --> P link relates to this cluster if one
        // of its products is visible (or both)
        const
            fpi = this.indexOfProduct(lnk.from_node),
            tpi = this.indexOfProduct(lnk.to_node);
        if(fpi >= 0 || tpi >= 0) {
          this.related_links.push(lnk);
          if(fpi >= 0) this.consumed_products.push(lnk.from_node);
          if(tpi >= 0) this.produced_products.push(lnk.to_node);
        }
      }
    }
    // NOTE: Iterate backwards through array, as elements may be removed.
    for(let ci = this.consumed_products.length - 1; ci >= 0; ci--) {
      const
          prod = this.consumed_products[ci],
          pi = this.produced_products.indexOf(prod);
      // Check whether products that are produced AND consumed in this
      // cluster are "internal", i.e., NOT produced or consumed by
      // processes outside this cluster
      if(pi >= 0) {
        // P is produced by some process in this cluster
        let ext = false;
        // Any "external" process that also produces P? 
        for(const l of prod.inputs) {
          if(this.all_processes.indexOf(l.from_node) < 0) {
            ext = true;
            break;
          }
        }
        // If not, any "external" process that consumes P?
        if(!ext) {
          for(const l of prod.outputs) {
            if(this.all_processes.indexOf(l.to_node) < 0) {
              ext = true;
              break;
            }
          }
        }
        // If P does NOT relate to any process outside this cluster,
        // add it to the internal product set and remove it from the
        // produced & consumed sets.
        if(!ext) {
          this.internal_products.push(prod);
          this.consumed_products.splice(ci, 1);
          this.produced_products.splice(pi, 1);
        }
      }
    }
    // Since consumed and produced need not be disjoint, also compute
    // their disjunction.
    for(const p of this.produced_products) {
      // P must be both produced and consumed but NOT internal, and not
      // already in the IO set.
      if(this.consumed_products.indexOf(p) >= 0 &&
          this.internal_products.indexOf(p) < 0 &&
          this.io_products.indexOf(p) < 0) this.io_products.push(p);
    }

    // To properly generate the arrows for this cluster, the subclusters
    // must also be categorized.
    for(const c of this.sub_clusters) c.categorizeEntities();  // recursion!

    // Use the product categories to determine which constraints relate
    // to this cluster.
    for(let c in MODEL.constraints) if(MODEL.constraints.hasOwnProperty(c)) {
      const cns = MODEL.constraints[c];
      // NOTE: Constraints A --> B relate to this cluster if A and/or B
      // are visible, meaning that A or B is a process in THIS cluster
      // (not its sub-clusters) or a product having a product position
      // in this cluster.
      if(this.processes.indexOf(cns.from_node) >= 0 ||
          this.processes.indexOf(cns.to_node) >= 0 ||
          this.indexOfProduct(cns.from_node) >= 0 ||
          this.indexOfProduct(cns.to_node) >= 0) {
        this.related_constraints.push(cns);
      }
    }
    
    // Finally, add the arrows
    for(const l of this.related_links) this.addToArrowList(l);
  }

  addToArrowList(lnk) {
    // Adds `lnk` to an existing arrow in this cluster, or creates a
    // new one.
    // NOTE: Since links may relate more than two clusters (e.g., from
    // cluster having Q1 -> P to cluster having P -> Q2 and another
    // cluster having P -> Q3) and/or generate bidirectional flows
    // (e.g., between cluster A having Q1 -> P1 and P2 -> Q2 and
    // cluster B having P1 -> Q3 and Q4 -> P2), we use instances of
    // class Arrow, where each instance will correspond to a single
    // arrow (or condensed node, q.v.) that graphically represents
    // one or more links.

    // NOTE: The distinction between P and Q made below is needful for
    // links (to keep track of the direction of their flow), but not
    // for constraints. Particular to constraints is that, unlike links,
    // they may relate to two processes.
    let p,
        q;
    const
        p_to_q = lnk.from_node instanceof Product,
        q_to_q = lnk.from_node instanceof Process &&
            lnk.to_node instanceof Process;
    // Set P to be the product and Q to be the process (so link is
    // either P --> Q or Q --> P).
    if(p_to_q) {
      p = lnk.from_node;
      q = lnk.to_node;
    } else {
      q = lnk.from_node;
      p = lnk.to_node;
    }
    // NOTE: Now Q may STILL be a "data product", while P may be a
    // process if `lnk` is a constraint.

    // P and Q are visible if they have a placeholder in this cluster,
    // or if they are processes in this cluster.
    const
        pi = this.indexOfProduct(p),
        qi = this.indexOfProduct(q),
        p_in_c = (p instanceof Process ? p.cluster === this : pi >= 0),
        q_in_c = (q instanceof Process ? q.cluster === this : qi >= 0);

    // If P and Q are BOTH visible in the focal cluster, add a default arrow.
    if(p_in_c && q_in_c) {
      this.addArrow(lnk);
      return;
    }
    // Anticipating further steps, find out for process nodes whether
    // they are in THIS cluster, and if not, in which immediate
    // sub-cluster of this cluster.
    let cp = null,
        cq = null;
    if(p instanceof Process) {
      cp = this.containsProcess(p);
      // Climb up the cluster hierarchy until `cp` is visible in this cluster.
      while(cp !== null && cp !== this && cp.cluster !== this) {
        cp = cp.cluster;
      }
    }
    if(q instanceof Process) {
      cq = this.containsProcess(q);
      // Climb up the cluster hierarchy until `cq` is visible in this cluster.
      while(cq !== null && cq !== this && cq.cluster !== this) {
        cq = cq.cluster;
      }
    }

    // If P and Q are both processes, while either one is not visible,
    // the arrow will be unique (as each process is in only ONE cluster)
    // and connect either a process node to a cluster node, or two
    // cluster nodes.
    if(q_to_q) {
      if(p_in_c) {
        this.addArrow(lnk, p, cq);
      } else if(q_in_c) {
        this.addArrow(lnk, cp, q);
      } else if(cp !== cq) {
        this.addArrow(lnk, cp, cq);
      }
      return;
    }
    
    // NOTE: From this point, either P or Q is a product, or both, and
    // only one of them is visible.
    const pp_link = p instanceof Product && q instanceof Product;
    if(q_in_c) {
      // If Q is visible, but P is not, this leaves two possibilities:
      // (1) P is produced and/or consumed in one or more sub-clusters,
      //     so check them all and *count* the arrows this implies.
      let acnt = 0;
      for(const c of this.sub_clusters) {
        let add = (p_to_q ?  c.produced_products.indexOf(p) >= 0 :
            c.consumed_products.indexOf(p) >= 0);
        if(!add) add = (pp_link && c.indexOfProduct(p) >= 0);
        if(add) {
          this.addArrow(lnk, q, c, p_to_q);
          acnt++;
        }
      }
      // MOREOVER: P might also be produced c.q. consumed by processes
      // in this cluster, so check these as well.
      for(const qq of this.processes) if(qq !== q) {
        // Check if QQ --> P --> Q or Q --> P --> QQ
        if(p_to_q ? qq.doesProduce(p) : qq.doesConsume(p)) {
          this.addArrow(lnk, q, qq, p_to_q);
          acnt++;
        }
      }
      if(acnt > 0) return;
      // (2) if P --> Q and P is NOT produced in this cluster or some
      //     of its sub-clusters, or Q --> P and P is NOT consumed in
      //     this cluster or some of its sub-clusters, then this link
      //     should be represented by a block arrow.
      if((p_to_q ?
          this.produced_products.indexOf(p) < 0 :
          this.consumed_products.indexOf(p) < 0
          ) && this.internal_products.indexOf(p) < 0
      ) {
        this.addArrow(lnk, q, null, p_to_q);
      }
      return;
    }
    
    // If P is visible while Q is not, add (to) the arrow between P and
    // the sub-cluster containing Q.
    if(pi >= 0) {
      if(pp_link) {
        // Cluster containing q is not known -- could be multiple
        for(const c of this.sub_clusters) {
          if(c.indexOfProduct(q) >= 0) this.addArrow(lnk, p, c, !p_to_q);
        }
      } else {
        this.addArrow(lnk, cq, p, p_to_q);
      }
      return;
    }
    
    // If both P and Q are invisible, Q is uniquely in `cq`, but if
    // P --> Q, P might NOT be produced inside this cluster, and likewise
    // if Q --> P, P might NOT be consumed). In such cases, this link
    // must be displayed as "block arrow" on the subcluster containing Q.
    if((p_to_q ? this.produced_products.indexOf(p) < 0 :
         this.consumed_products.indexOf(p) < 0
       ) && this.internal_products.indexOf(p) < 0) {
      this.addArrow(lnk, cq, null, p_to_q);
      return;
    }

    // Finally, if P is produced (if P --> Q) or consumed (if Q --> P)
    // in this cluster, then this can happen in several sub-clusters,
    // so check them all.
    for(cp of this.sub_clusters) {
      // NOTE: No arrow between a sub-cluster and itself
      if(cp !== cq) {
        if(cp.all_products.indexOf(p) >= 0) {
          this.addArrow(lnk, cq, cp, p_to_q);
        }
      }
    }
  }

  containsLink(l) {
    // Return TRUE iff link `l` is related to some process in this cluster.
    return this.related_links.indexOf(l) >= 0;
  }
  
  linkInList(l, list) {
    // Return TRUE iff both the FROM node and the TO node of link/constraint
    // `l` are elements of `list`.
    // NOTE: This method used in linny-r-gui.js to see which links
    // and/or constraints are to be included when the modeler performs
    // a "rectangular area select".
    let prod, proc;
    if(l.to_node instanceof Process) {
      proc = l.to_node;
      prod = l.from_node;
    } else {
      proc = l.from_node;
      prod = l.to_node;
    }
    const
        proc_in = list.indexOf(proc) >= 0,
        prod_in = list.indexOf(prod) >= 0;
    if(proc_in && prod_in) return true;
    const
        con_proc = (proc_in ? null : this.containsProcess(proc)),
        con_prod = (prod_in ? null : this.containsProduct(prod)),
        con_proc_in = con_proc !== null && list.indexOf(con_proc) >= 0,
        con_prod_in = con_prod !== null && list.indexOf(con_prod) >= 0;
    return (proc_in && con_prod_in) ||
        (prod_in && con_proc_in) ||
        (con_proc !== con_prod && con_proc_in && con_prod_in);
  }

  deleteProduct(p, with_xml=true) {
    // Remove "placeholder" of product `p` from this cluster, and
    // remove `p` from the model if there are no other clusters
    // containing a "placeholder" for `p`.
    // Always set "selected" attribute to FALSE (or the product will
    // still be drawn in red).
    p.selected = false;
    let i = this.indexOfProduct(p);
    if(i < 0) return false;
    // Append XML for product positions unlesss deleting from a cluster
    // that is being deleted.
    if(with_xml) UNDO_STACK.addXML(this.product_positions[i].asXML);
    // Remove product position of `p` in this cluster.
    this.product_positions.splice(i, 1);
    // Do not delete product from this cluster if it has links to
    // processes in other clusters, of if this cluster is updating
    // and binds the product as parameter.
    if(!p.allLinksInCluster(this) || (IO_CONTEXT && IO_CONTEXT.isBinding(p))) {
      // NOTE: Removing only the product position DOES affect the
      // diagram, so prepare for redraw.
      this.clearAllProcesses();
      return false;
    }
    // If no clusters contain `p`, delete it from the model entirely
    // (incl. all links to and from `p`). NOTE: Such deletions WILL
    // append their undo XML.
    MODEL.deleteNode(p);
    return true;
  }

  deleteNote(n, with_xml=true) {
    // Remove note `n` from this cluster's note list
    let i = this.notes.indexOf(n);
    if(i >= 0) {
      if(with_xml) UNDO_STACK.addXML(n.asXML);
      this.notes.splice(i, 1);
    }
    return i > -1;
  }

  listSubclustersAndProcesses(list) {
    for(const p of this.processes) list.push(p);
    for(const c of this.sub_clusters) {
      list.push(c);
      c.listSubclustersAndProcesses(list); // recursion!
    }
  }
  
  positionProducts() {
    for(const pp of this.product_positions) {
      const p = pp.product;
      p.x = pp.x;
      p.y = pp.y;
      p.clearHiddenIO();
    }
  }
  
  canBeCloned(prefix, actor_name) {
    // Return TRUE iff all entities within this cluster can be cloned
    // with the specified prefix and actor name.
    if(this.is_black_boxed) {
      UI.notify('Black-boxed clusters cannot be cloned');
      return false;
    }
    let name,
        aname;
    for(const p of this.processes) {
      name = prefix + p.name;
      aname = (actor_name ? actor_name : p.actor.name);
      if(aname && aname !== UI.NO_ACTOR) name += ` (${aname})`;
      const e = MODEL.objectByName(name);
      if(e) {
        UI.warningEntityExists(e);
        return false;            
      }
    }
    for(const pp of this.product_positions) {
      const
          p = pp.product,
          e = MODEL.objectByName(prefix + p.name);
      // NOTE: ignore existing product issue when no prefix is defined,
      // as then only processes and clusters will be cloned (for new actor)
      if(e && prefix) {
        UI.warningEntityExists(e);
        return false;            
      }
    }
    for(const c of this.sub_clusters) {
      // NOTE: Recursive call!
      if(!c.canBeCloned(prefix, actor_name)) return false;
    }
    return true;
  }
  
  cloneFrom(c, prefix, actor_name, nodes=null) {
    // Adds clones of all entities within `c` to this cluster, and then
    // adds links between the cloned entities only AFTER recursively cloning.
    // NOTE: Does not alter the name or actor of this cluster -- these are
    // assumed to be set when this cluster was added to the model.
    let clone_links = false;
    if(nodes === null) {
      // The *initial* call to cloneFrom should NOT pass `nodes`.
      nodes = [];
      clone_links = true;
    }
    this.x = c.x;
    this.y = c.y;
    this.collapsed = c.collapsed;
    this.resize();
    // First clone notes.
    for(const n of c.notes) {
      const cn = new Note(this);
      this.notes.push(cn);
      n.copyPropertiesFrom(n);
    }
    // Declare some local variables.
    let name,
        aname,
        actor;
    // NOTE: MODEL.addProcess adds process to focal cluster, so
    // *temporarily* set it to `this`.
    const fc = MODEL.focal_cluster;
    MODEL.focal_cluster = this;
    // Now we can clone the processes.
    for(const p of c.processes) {
      const
          a = (actor_name ? actor_name : c.actor.name),
          cp = MODEL.addProcess(prefix + p.name, a);
      if(cp) {
        cp.copyPropertiesFrom(p);
        // Add the *original* process to the node list.
        addDistinct(p, nodes);
      } else {
        // Restore original focal cluster before breaking on error.
        MODEL.focal_cluster = fc;
        return;
      }
    }
    // Also restore original focal cluster when done adding processes.
    MODEL.focal_cluster = fc;
    // Then clone product positions, and their products if needed.
    for(const pp of c.product_positions) {
      const
          p = pp.product,
          cp = MODEL.addProduct(prefix + p.name);
      if(cp) {
        cp.copyPropertiesFrom(p);
        const cpp = this.addProductPosition(cp);
        cpp.x = pp.x;
        cpp.y = pp.y;
        // Add the *original* product to the node list.
        addDistinct(p, nodes);
      } else {
        return;
      }
    }
    // Then clone sub-clusters.
    for(const subc of c.sub_clusters) {
      name = prefix + subc.name;
      aname = (actor_name ? actor_name : subc.actor.name);
      actor = MODEL.addActor(aname);
      const newc = new Cluster(this, name, actor);
      MODEL.clusters[newc.identifier] = newc;
      // Recursive call -- passing on the node list to add to.
      newc.cloneFrom(subc, prefix, actor_name, nodes);
    }
    // Finally, clone links and constraints only when this was the
    // "root" cluster being cloned.
    if(clone_links) {
      const to_clone = [];
      // Clone all links AND constraints in the entire model that have
      // both nodes in the list of nodes that have been cloned.
      for(let k in MODEL.links) if(MODEL.links.hasOwnProperty(k)) {
        const l = MODEL.links[k];
        if(nodes.indexOf(l.from_node) >= 0 && nodes.indexOf(l.to_node) >= 0) {
          to_clone.push(l);
        }
      }
      for(let k in MODEL.constraints) if(MODEL.constraints.hasOwnProperty(k)) {
        const c = MODEL.constraints[k];
        if(nodes.indexOf(c.from_node) >= 0 && nodes.indexOf(c.to_node) >= 0) {
          to_clone.push(c);
        }
      }
      for(const l of to_clone) {
        // NOTE: Links and constraints both have FROM and TO nodes.
        let cf = l.from_node,
            ct = l.to_node;
        // If in selection, map FROM node onto cloned node.
        if(cf instanceof Process) {
          let name = prefix + cf.name;
          const aname = (actor_name ? actor_name : cf.actor.name);
          if(aname && aname !== UI.NO_ACTOR) name += ` (${aname})`;
          cf = MODEL.objectByName(name);
        } else {
          cf = MODEL.objectByName(prefix + cf.name);
        }
        // Do likewise for the TO node.
        if(ct instanceof Process) {
          let name = prefix + ct.name;
          const aname = (actor_name ? actor_name : ct.actor.name);
          if(aname && aname !== UI.NO_ACTOR) name += ` (${aname})`;
          ct = MODEL.objectByName(name);
        } else {
          ct = MODEL.objectByName(prefix + ct.name);
        }
        // Only now differentiate between links and constraints.
        let cl = null;
        if(l instanceof Link) {
          // Add the new link ...
          cl = MODEL.addLink(cf, ct);
        } else {
          // ... or the new constraint ...
          cl = MODEL.addConstraint(cf, ct);
        }
        if(!cl) return;
        // ... but do not add its to the clone list if it already exists.
        if(cl !== l) cl.copyPropertiesFrom(l);
      }
    }
  }

  differences(c) {
    // Return "dictionary" of differences, or NULL if none.
    if(this.is_black_boxed) return null;
    const
        d = differences(this, c, UI.MC.CLUSTER_PROPS),
        cn = (this.cluster ? this.cluster.displayName : ''),
        ccn = (c.cluster ? c.cluster.displayName : '');
    if(cn !== ccn) d.cluster = {A: cn, B: ccn};
    // Check for added processes.
    let diff = {};
    for(const p of this.processes) {
      const pid = p.identifier;
      let mp = null;
      for(const cp of c.processes) if(cp.identifier === pid) {
        mp = cp;
        break;
      }
      if(!mp) diff[pid] = [UI.MC.ADDED, p.displayName];
    }
    // Check for deleted processes.
    for(const cp of c.processes) {
      const cpid = cp.identifier;
      let mp = null;
      for(const p of this.processes) if(p.identifier === cpid) {
        mp = p;
        break;
      }
      if(!mp) diff[cpid] = [UI.MC.DELETED, cp.displayName];
    }
    if(Object.keys(diff).length > 0) d.processes = diff;

    // Check for added product positions.
    diff = {};
    for(const pp of this.product_positions) {
      const
          p = pp.product,
          pid = p.identifier;
      let cp = null;
      for(const cpp of c.product_positions) {
        if(cpp.product.identifier === pid) {
          cp = cpp.product;
          break;
        }
      }
      if(!cp) diff[pid] = [UI.MC.ADDED, p.displayName];
    }
    // Check for deleted product positions.
    for(const cpp of c.product_positions) {
      const
          cp = cpp.product,
          cpid = cp.identifier;
      let p = null;
      for(const pp of this.product_positions) {
        if(pp.product.identifier === cpid) {
          p = pp.product;
          break;
        }
      }
      if(!p) diff[cpid] = [UI.MC.DELETED, cp.displayName];
    }
    if(Object.keys(diff).length > 0) d.product_positions = diff;

    // Check for added / modified sub-clusters.
    diff = {};
    for(const sc of this.sub_clusters) {
      const scid = sc.identifier;
      let csc = null;
      for(const cc of c.sub_clusters) {
        if(cc.identifier === scid) {
          csc = cc;
          break;
        }
      }
      if(csc) {
        const cdiff = sc.differences(csc);
        if(cdiff) diff[scid] = [UI.MC.MODIFIED, sc.displayName, cdiff];
      } else {
        diff[scid] = [UI.MC.ADDED, sc.displayName];
      }
    }
    // Check for deleted sub-clusters.
    for(const cc of c.sub_clusters) {
      const ccid = cc.identifier;
      let csc = null;
      for(const sc of this.sub_clusters) {
        if(sc.identifier === ccid) {
          csc = sc;
          break;
        }
      }
      if(!csc) diff[ccid] = [UI.MC.DELETED, cc.displayName];
    }
    if(Object.keys(diff).length > 0) d.sub_clusters = diff;

    // Check for added / modified notes
    diff = {};
    for(const n of this.notes) {
      let mn = null;
      // NOTE: n.timestamp is identifying property.
      for(const cn of c.notes) {
        if(cn.timestamp === n.timestamp) {
          mn = cn;
          break;
        }
      }
      if(mn) {
        const ndiff = n.differences(mn);
        if(ndiff) diff[n.timestamp] = [UI.MC.MODIFIED, n.displayName, ndiff];
      } else {
        diff[n.timestamp] = [UI.MC.ADDED, n.displayName];
      }
    }
    // Check for deleted notes.
    for(const cn of c.notes) {
      let mn = null;
      for(const n of this.notes) {
        if(n.timestamp === cn.timestamp) {
          mn = n;
          break;
        }
      }
      if(!mn) diff[cn.timestamp] = [UI.MC.DELETED, cn.displayName];
    }
    if(Object.keys(diff).length > 0) d.notes = diff;

    // Only return the differences if any were detected.
    if(Object.keys(d).length > 0) return d;
    return null;
  }

}  // END of class Cluster


// CLASS Node (superclass for processes and products)
class Node extends NodeBox {
  constructor(cluster, name, actor) {
    super(cluster, name, actor);
    // Nodes are assigned a unique code as "shorthand notation".
    // NOTE: Decimal numbers for processes, Excel-style letter codes for
    // products, i.e., A, ..., Z, AA, AB, etc.
    this.code = null;
    // By default, nodes are NOT data products (only products can become data).
    this.is_data = false;
    // By default, node levels are continuous, but may be set to integer.
    this.integer_level = false;
    // Processes and products both have input attributes LB, UB and IL,
    // and result attributes L and CP.
    this.lower_bound = new Expression(this, 'LB', '');
    this.upper_bound = new Expression(this, 'UB', '');
    this.initial_level = new Expression(this, 'IL', '0');
    this.cost_price = [];
    // NOTE: For processes, level denotes the production level, for products
    // the stock level.
    this.level = [];
    // `inputs` is array of incoming links, `outputs` is array of outgoing links.
    this.inputs = [];
    this.outputs = [];
    this.predecessors = [];
  }

  hasInput(node) {
    for(const l of this.inputs) if(l.from_node == node) return l;
    return false;
  }

  hasOutput(node) {
    for(const l of this.outputs) if(l.to_node == node) return l;
    return false;
  }
  
  get hasBounds() {
    // Return TRUE if lower or upper bound is defined for this node.
    return this.upper_bound.defined || this.lower_bound.defined;
  }
  
  setConstraintOffsets() {
    // Set the offset properties of the constraints that relate to this
    // node. These properties are used when drawing these constraints.
    const tbc = {top: [], bottom: [], thumb: []};
    for(let k in MODEL.constraints) if(MODEL.constraints.hasOwnProperty(k)) {
      const
          c = MODEL.constraints[k],
          vn = c.visibleNodes;
      if(vn[0] || vn[1]) {
        let q;
        if(c.from_node === this) {
          q = c.to_node;
        } else if(c.to_node === this) {
          q = c.from_node;
        } else {
          continue;
        }
        if(vn[0] && vn[1]) {
          // Both nodes visible => arrow.
          if(this.y < q.y - (q.height/2 + 3) - this.height) {
            // Arrow from bottom of THIS to top of q.
            c.bottom_x = q.x;
            c.bottom_y = q.y;
            tbc.bottom.push(c);
          } else {
            // Arrow from bottom of THIS to top of q.
            c.top_x = q.x;
            c.top_y = q.y;
            tbc.top.push(c);
          }
        } else {
          // One node visible => thumbnail at top of this process.
          // NOTE: X coordinate not needed for sorting.
          tbc.thumb.push(c);
        }
      }
    }
    const
        tl = tbc.top.length,
        bl = tbc.bottom.length,
        thl = tbc.thumb.length,
        hdx = (thl > 0 ? (thl - 1) * 9 : 0),
        // NOTE: `top` and `bottom` lists are sorted on the X-coordinate
        // of the other node q.
        tcmp = (a, b) => {
            // When same X, the lower one (higher Y) comes first.
            if(a.top_x === b.top_x) {
              if(this.x >= a.top_x) return b.top_y - a.top_y;
              return a.top_y - b.top_y;
            }
            return a.top_x - b.top_x;
          },
        bcmp = (a, b) => {
            // When same X, the upper one (lower Y) comes first.
            if(a.bottom_x === b.bottom_x) {
              if(this.x >= a.bottom_x) return a.bottom_y - b.bottom_y;
              return b.bottom_y - a.bottom_y;
            }
            return a.bottom_x - b.bottom_x;
         };
    if(thl > 0) {
      // Space thumbnails evenly at center X of node.
      let dx = -hdx; 
      for(const c of tbc.thumb) {
        if(c.from_node === this) {
          c.from_offset = dx;
        } else {
          c.to_offset = dx;
        }
        dx += 18;
      }
    }
    // Calculate available width at either side of thumbnails.
    const
        // Keep 10px between connection points, and for processes
        // also keep this distance from the rectangle corners.
        margin = 10,
        aw = (this instanceof Process ?
            (this.collapsed ? 8.5 : this.width / 2) :
            (this.width - this.height) / 2 + margin) - 9 * thl;
    if(tl > 0) {
      tbc.top.sort(tcmp);
      // Start on leftmost suitable point at top.
      let dx = -aw + margin;
      // NOTE: Process from left to right.
      for(const c of tbc.top) {
        // Only position constraints THIS --> q with q left of THIS node.
        if(c.top_x < this.x) {
          if(c.from_node === this) {
            c.from_offset = dx;
          } else {
            c.to_offset = dx;
          }
          dx += margin;
        }
      }
      // Start on rightmost suitable point at top.
      dx = aw - margin;
      // NOTE: Now process from right to left.
      for(let i = tl - 1; i >= 0; i--) {
        const c = tbc.top[i];
        // Only position constraints THIS --> q NOT left of THIS
        if(c.top_x >= this.x) {
          if(c.from_node === this) {
            c.from_offset = dx;
          } else {
            c.to_offset = dx;
          }
          dx -= margin;
        }
      }
    }
    if(bl > 0) {
      tbc.bottom.sort(bcmp);
      // Start on leftmost suitable point at bottom.
      let dx = -aw + margin;
      // NOTE: Process from left to right.
      for(const c of tbc.bottom) {
        // Only position constraints THIS --> q with q left of THIS node.
        if(c.bottom_x < this.x) {
          if(c.from_node === this) {
            c.from_offset = dx;
          } else {
            c.to_offset = dx;
          }
          dx += margin;
        }
      }
      // Start on rightmost suitable point at bottom
      dx = aw - margin;
      // NOTE: Now process from right to left.
      for(let i = bl - 1; i >= 0; i--) {
        const c = tbc.bottom[i];
        // Only position constraints THIS --> q NOT left of THIS
        if(c.bottom_x >= this.x) {
          if(c.from_node === this) {
            c.from_offset = dx;
          } else {
            c.to_offset = dx;
          }
          dx -= margin;
        }
      }
    }
    return tbc;
  }
  
  get needsOnOffData() {
    // Return TRUE if this node requires a binary ON/OFF variable.
    // This means that at least one output link must have the "start-up",
    // "positive", "zero", "shut-down", "spinning reserve" or
    // "first commit" multiplier.
    // NOTE: As of version 2.0.0, power grid processes also need ON/OFF.
    if(this.grid) return true;
    for(const l of this.outputs) {
      if(VM.LM_NEEDING_ON_OFF.indexOf(l.multiplier) >= 0) {
        return true;
      }
    }
    return false;
  }

  get needsIsZeroData() {
    // Return TRUE if this node requires a binary IS ZERO variable.
    // This means that at least one output link must have the "zero"
    // multiplier.
    for(const l of this.outputs) if(l.multiplier === VM.LM_ZERO) return true;
    return false;
  }

  get needsStartUpData() {
    // Return TRUE iff this node has an output data link for start-up
    // or first commit.
    for(const l of this.outputs) {
      const m = l.multiplier;
      if(m === VM.LM_STARTUP || m === VM.LM_FIRST_COMMIT) return true;
    }
    return false;
  }
  
  get needsShutDownData() {
    // Return TRUE iff this node has an output data link for shut-down. 
    for(const l of this.outputs) {
      if(l.multiplier === VM.LM_SHUTDOWN) return true;
    }
    return false;
  }
  
  get needsFirstCommitData() {
    // Return TRUE iff this node has an output data link for first commit. 
    for(const l of this.outputs) {
      if(l.multiplier === VM.LM_FIRST_COMMIT) return true;
    }
    return false;
  }
  
  get linksToFirstCommitDataProduct() {
    // Return data product P iff this node has an output link to P, and P has
    // an output link for first commit.
    for(const l of this.outputs) {
      const p = l.to_node;
      if(p.is_data && p.needsFirstCommitData) return p;
    }
    return false;
  }
  
  get needsMaximumData() {
    // Returns TRUE iff this node has an output data link for peak
    // increase, and hence should track its peak value (per block).
    for(const l of this.outputs) {
      if(l.multiplier === VM.LM_PEAK_INC) return true;
    }
    return false;
  }
  
  setPredecessors() {
    // Recursive function to create list of all nodes that precede this one.
    // NOTE: As of version 2.0.0, feedback links are no longer displayed
    // as such. To permit re-enabling this function, the functional part
    // of this method has been commented out.
 
/*
    for(const l of this.inputs) {
      if(!l.visited) {
        l.visited = true;
        const n = l.from_node;
        if(this.predecessors.indexOf(n) < 0) {
          this.predecessors.push(n);
        }
        const pp = n.setPredecessors();  // Recursion!
        for(const n of pp) {
          if(this.predecessors.indexOf(n) < 0) {
            this.predecessors.push(n);
          }
        }
      }
    }
*/
    return this.predecessors;
  }
  
  resetStartUps(t) {
    // Remove all time steps >= t from start-up list.
    const su = [];
    for(const sut of this.start_ups) if(sut < t) su.push(sut);
    this.start_ups = su;
  }

  resetShutDowns(t) {
    // Remove all time steps >= t from shut-down list.
    const sd = [];
    for(const sdt of this.shut_downs) if(sdt < t) sd.push(sdt);
    this.shut_downs = sd;
  }

  doesConstrain(node) {
    // Returns the instance of Constraint if this node already constrains
    // `node` or vice versa.
    // NOTE: constraints have FOUR underscores between node codes
    let cid = this.code + '____' + node.code;
    if(MODEL.constraints.hasOwnProperty(cid)) return MODEL.constraints[cid];
    // If A constraints B, then B also constrains A
    cid = node.code + '____' + this.code;
    if(MODEL.constraints.hasOwnProperty(cid)) return MODEL.constraints[cid];
    return null;
  }

  canConstrain(node) {
    // Return TRUE if this node can constrain `node`.
    // NOTE: A node cannot constrain itself, and BOTH nodes must have upper bounds.
    return this !== node && this.upper_bound.defined && node.upper_bound.defined;
  }

  get costAddingConstraints() {
    // Return a (possibly empty) list of composite constraints that can
    // transfer cost to this node.
    let cac = [];
    for(let k in MODEL.constraints) if(MODEL.constraints.hasOwnProperty(k)) {
      const c = MODEL.constraints[k];
      if(c.share_of_cost > 0 &&
          ((c.to_node == this && c.soc_direction === VM.SOC_X_Y) ||
              (c.from_node == this && c.soc_direction === VM.SOC_Y_X))) {
        cac.push(c);
      }
    }
    return cac;
  }
  
  convertLegacyBoundData(lb_data, ub_data) {
    // Convert time series data for LB and UB in legacy models to datasets,
    // and replace attribute expressions by references to these datasets.
    if(!lb_data && !ub_data) return;
    const same = lb_data === ub_data;
    if(lb_data) {
      const
          dsn = this.displayName + (same ? '' : ' LOWER') + ' BOUND DATA',
          ds = MODEL.addDataset(dsn);
      // Use the LB attribute as default value for the dataset
      ds.default_value = parseFloat(this.lower_bound.text);
      // UB data has same unit as product
      ds.scale_unit = this.scale_unit;
      ds.data = stringToFloatArray(lb_data);
      ds.computeVector();
      ds.computeStatistics();
      this.lower_bound.text = `[${dsn}]`;
      if(same) this.equal_bounds = true;
      MODEL.legacy_datasets = true;
    }
    if(ub_data && !same) {
      const
          dsn = this.displayName + ' UPPER BOUND DATA',
          ds = MODEL.addDataset(dsn);
      ds.default_value = parseFloat(this.upper_bound.text);
      // UB data has same unit as product
      ds.scale_unit = this.scale_unit;
      ds.data = stringToFloatArray(ub_data);
      ds.computeVector();
      ds.computeStatistics();
      this.upper_bound.text = `[${dsn}]`;
      MODEL.legacy_datasets = true;
    }
  }

  actualLevel(t) {
    // Returns the production level c.q. stock level for this node in
    // time step t.
    if(t < 0) return this.initial_level.result(1);
    if(t < this.level.length) return this.level[t];
    return VM.UNDEFINED;
  }
  
  nonZeroLevel(t, lm=VM.LM_LEVEL) {
    // Return the level or 0 when level is negligible relative to the
    // bounds on the node. If `lm` specifies a special link multiplier,
    // then return the value of the associated binary variable.
    if(lm !== VM.LM_LEVEL) {
      if(lm === VM.LM_STARTUP) return (this.start_ups.indexOf(t) < 0 ? 0 : 1);
      if(lm === VM.LM_SHUTDOWN) return (this.shut_downs.indexOf(t) < 0 ? 0 : 1);
      if(lm === VM.LM_FIRST_COMMIT) return (this.start_ups.indexOf(t) === 0 ? 1 : 0);
      let l = (t < 0 ? this.initial_level.result(1) : this.level[t]);
      if(l === undefined) return VM.UNDEFINED;
      l = (Math.abs(l) < VM.NEAR_ZERO ? 0 : 1);
      if(lm === VM.LM_POSITIVE) return l;
      if(lm === VM.LM_ZERO) return 1 - l;
    }
    if(t < 0) return this.initial_level.result(1);
    if(t < this.level.length) {
      const l = this.level[t];
      if(Math.abs(l) > VM.ON_OFF_THRESHOLD) return l;
      return 0;
    }
    return VM.UNDEFINED;
  }

  costPrice(t) {
    // Returns the cost price for this node in time step t
    if(t >= 0 && t < this.cost_price.length) return this.cost_price[t];
    return VM.UNDEFINED;
  }
  
  get nextAvailableNumberName() {
    // Returns node name ending with the first number > its present number,
    // provided that the name ends with a number; otherwise an empty string
    const nc = this.numberContext;
    if(!nc) return '';
    const
        base = this.name.slice(0, -nc.length),
        aname = (this.hasActor ? ` (${this.actor.name})` : '');
    let n = parseInt(nc),
        nn,
        e = this;
    while(e) {
      n++;
      nn = base + n;
      e = MODEL.objectByName(nn + aname);
    }
    return nn;
  }
  
  get TEXforBinaries() {
    // Return LaTeX code for formulas that compute binary variables.
    // In the equations, binary variables are underlined to distinguish
    // them from (semi-)continuous variables.
    const
        NL = '\\\\\n',
        tex = [NL],
        x = (this.level_to_zero ? '\\hat{x}' : 'x'),
        sub = (MODEL.start_period !== MODEL.end_period ?
            '_{' + this.code + ',t}' : '_' + this.code),
        sub_1 = '_{' + this.code +
            (MODEL.start_period !== MODEL.end_period ? ',t-1}' : ',0}');
    if(this.needsOnOffData) {
      // Equations to compute OO variable (denoted as u for "up").
      // (a)  L[t] - LB[t]*OO[t] >= 0
      tex.push(x + sub, '- LB' + sub, '\\mathbf{u}' + sub, '\\ge 0', NL);
      // (b)  L[t] - UB[t]*OO[t] <= 0
      tex.push(x + sub, '- UB' + sub, '\\mathbf{u}' + sub, '\\le 0', NL);
    }
    if(this.needsIsZeroData) {
      // Equation to compute IZ variable (denoted as d for "down").
      // (c) OO[t] + IZ[t] = 1
      tex.push('\\mathbf{u}' + sub, '+ \\mathbf{d}' + sub, '= 0', NL);
      // (d) L[t] + IZ[t] >= LB[t]
      // NOTE: for semicontinuous variables, use 0 instead of LB[t]
      tex.push(x + sub, '+ \\mathbf{d}' + sub, '\\ge',
          (this.level_to_zero ? '0' : 'LB' + sub), NL);
    }
    if(this.needsStartUpData) {
      // Equation to compute start-up variable (denoted as su).
      // (e) OO[t-1] - OO[t] + SU[t] >= 0
      tex.push('\\mathbf{u}' + sub_1, '- \\mathbf{u}' + sub, 
          '+ \\mathbf{su}' + sub, '\\ge 0', NL);
      // (f) OO[t] - SU[t] >= 0
      tex.push('\\mathbf{u}' + sub, '- \\mathbf{su}' + sub, '\\ge 0', NL);
      // (g) OO[t-1] + OO[t] + SU[t] <= 2
      tex.push('\\mathbf{u}' + sub_1, '+ \\mathbf{u}' + sub,
          '+ \\mathbf{su}' + sub, '\\le 2', NL);
    }
    if(this.needsShutDownData) {
      // Equation to compute shutdown variable (denoted as sd-circumflex).
      // (e2) OO[t] - OO[t-1] + SD[t] >= 0
      tex.push('\\mathbf{u}' + sub, '- \\mathbf{u}' + sub_1, 
          '+ \\mathbf{sd}' + sub, '\\ge 0', NL);
      // (f2) OO[t] + SD[t] <= 1
      tex.push('\\mathbf{u}' + sub, '+ \\mathbf{sd}' + sub, '\\le 1', NL);
      // (g2) SD[t] - OO[t-1] - OO[t] <= 0
      tex.push('\\mathbf{sd}' + sub, '- \\mathbf{u}' + sub_1,
          '- \\mathbf{su}' + sub, '\\le 0', NL);
    }
    if(this.needsFirstCommitData) {
      // Equation to compute first commit variables (denoted as fc).
      // To detect a first commit, start-ups are counted using an extra
      // variable SC (denoted as suc) and then similar equations are
      // added to detect "start-up" for this counter. This means one more
      // binary SO (denoted as suo for "start-up occurred").
      // (h)  SC[t] - SC[t-1] - SU[t] = 0
      tex.push('\\mathbf{suc}' + sub, '- \\mathbf{suc}' + sub_1,
          '- \\mathbf{su}' + sub, '= 0', NL);
      // (i)  SC[t] - SO[t] >= 0
      tex.push('\\mathbf{suc}' + sub, '- \\mathbf{suo}' + sub, '\\ge 0', NL);
      // (j)  SC[t] - run length * SO[t] <= 0
      tex.push('\\mathbf{suc}' + sub, '- N\\! \\mathbf{suo}' + sub, '\\le 0', NL);
      // (k)  SO[t-1] - SO[t] + FC[t] >= 0
      tex.push('\\mathbf{suo}' + sub_1, '- \\mathbf{suc}' + sub,
          '+ \\mathbf{fc}' + sub, '\\ge 0', NL);
      // (l)  SO[t] - FC[t] >= 0
      tex.push('\\mathbf{suo}' + sub, '- \\mathbf{fc}' + sub, '\\ge 0', NL);
      // (m)  SO[t-1] + SO[t] + FC[t] <= 2
      tex.push('\\mathbf{suo}' + sub_1, '+ \\mathbf{suo}' + sub,
          '+ \\mathbf{fc}' + sub, '\\le 2', NL);      
    }

    /*
       To calculate the peak increase values, we need two continuous
       "chunk variables", i.e., only 1 tableau column per chunk, not 1 for
       each time step. These variables BPI and CPI will compute the highest
       value (for all t in the block (B) and for the chunk (C)) of the
       difference L[t] - block peak (BP) of previous block. This requires
       one equation for every t = 1, ..., block length:
       (n) L[t] - BPI[b] <= BP[b-1]  (where b denotes the block number)
       plus one equation for every t = block length + 1 to chunk length:
       (o) L[t] - BPI[b] - CPI[b] <= BP[b-1]
       This ensures that CPI is the *additional* increase in the look-ahead 
       Then use BPI[b] in first time step if block, and CPI[b] at first
       time step of the look-ahead period to compute the actual flow for
       the "peak increase" links. For all other time steps this AF equals 0.

    */

    return tex.join(' ');
  }

} // END of class Node
  

// CLASS Process
class Process extends Node {
  constructor(cluster, name, actor) {
    super(cluster, name, actor);
    // By default, processes have the letter p, products the letter q.
    this.TEX_id = 'p';
    // NOTE: A process can change level once in PACE steps (default 1/1).
    // This means that for a simulation perio of N time steps, this process will
    // have a vector of only N / PACE decision variables (plus associated
    // binary variables for calculating ON/OFF, STARTUP, and related constraints).
    // The production level in time T thus corresponds to decision variable
    // X[Math.floor((T-1) / PACE + 1]
    this.pace = 1;
    this.pace_expression = new Expression(this, 'LCF', '1');
    // NOTE: processes have NO input attributes other than LB, UB and IL
    // for processes, the default bounds are [0, +INF]
    this.equal_bounds = false;
    // Flag to indicate that process is a semi-contiunous decision variable
    this.level_to_zero = false;
    // Process node can be collapsed to take up less space in the diagram
    this.collapsed = false;
    // Process can represent a power grid element, in which case it needs
    // properties for calculating power flow.
    this.power_grid = null;
    this.length_in_km = 0;
    this.reactance = 0;
    // Processes have 4 more result attributes: CF, MCF, CI and CO
    this.cash_flow = [];
    this.marginal_cash_flow = [];
    this.cash_in = [];
    this.cash_out = [];
    // Production level changing from 0 to positive counts as "start up",
    // while changing from positive to 0 counts as "shut down"
    // NOTE: being relatively rare, start_ups and shut_downs are not vectors,
    // but store the numbers of the time steps in which they occurred
    this.start_ups = [];
    this.shut_downs = [];
  }
  
  get type() {
    return 'Process';
  }

  get typeLetter() {
    return 'P';
  }
  
  get grid() {
    if(MODEL.with_power_flow) return this.power_grid;
    return null;
  }
  
  get gridEdge() {
    // Return "FROM node -> TO node" as string if this is a grid process.
    const g = this.grid;
    if(!g) return '';
    let fn = null,
        tn = null;
    for(const l of this.inputs) if(l.multiplier == VM.LM_LEVEL) {
      fn = l.from_node;
      break;
    }
    for(const l of this.outputs) {
      if(l.multiplier == VM.LM_LEVEL && !l.to_node.is_data) {
        tn = l.from_node;
        break;
      }
    }
    fn = (fn ? fn.displayName : '???');
    tn = (tn ? tn.displayName : '???');
    return `${fn} ${UI.LINK_ARROW} ${tn}`;
  }

  get attributes() {
    const a = {name: this.displayName};
    a.LB = this.lower_bound.asAttribute;
    a.UB = (this.equal_bounds ? a.LB : this.upper_bound.asAttribute);
    if(this.grid) a.LB = -a.UB;
    a.IL = this.initial_level.asAttribute;
    a.LCF = this.pace_expression.asAttribute;
    if(MODEL.solved) {
      const t = MODEL.t;
      a.L = this.level[t];
      a.CF = this.cash_flow[t];
      a.MCF = this.marginal_cash_flow[t];
      a.CI = this.cash_in[t];
      a.CO = this.cash_out[t];
      if(MODEL.infer_cost_prices) a.CP = this.cost_price[t];
    }
    return a;
  }
  
  setCode() {
    // Processes are assigned a unique number code.
    if(!this.code) this.code = MODEL.newProcessCode;
  }

  get asXML() {
    let n = this.name,
        col = this.collapsed,
        cmnts = xmlEncoded(this.comments),
        x = this.x,
        y = this.y,
        p = ` code="${this.code}"`;
    const
        an = (this.hasActor ? ` (${this.actor.name})` : ''),
        id = UI.nameToID(this.name + an);
    if(MODEL.black_box_entities.hasOwnProperty(id)) {
      // NOTE: "black-boxed" processes are saved anonymously, collapsed,
      // without comments or their (X, Y) position.
      n = MODEL.black_box_entities[id];
      // `n` is just the name, so remove the actor name if it was added.
      if(an) n = n.substring(0, n.lastIndexOf(an));
      col = true;
      cmnts = '';
      x = 0;
      y = 0;
    }
    if(col) p += ' collapsed="1"';
    if(this.integer_level) p += ' integer-level="1"';
    if(this.level_to_zero) p += ' level-to-zero="1"';
    if(this.equal_bounds) p += ' equal-bounds="1"';
    // NOTE: Save power grid related properties even when grid element
    // is not checked (so properties re-appear when re-checked).
    return ['<process', p, '><name>',  xmlEncoded(n),
        '</name><owner>', xmlEncoded(this.actor.name),
        '</owner><notes>', cmnts,
        '</notes><upper-bound>', this.upper_bound.asXML,
        '</upper-bound><lower-bound>', this.lower_bound.asXML,
        '</lower-bound><initial-level>', this.initial_level.asXML,
        '</initial-level><tex-id>', this.TEX_id,
        '</tex-id><pace>', this.pace_expression.asXML,
        '</pace><grid-id>', (this.power_grid ? this.power_grid.id : ''),
        '</grid-id><length>', this.length_in_km,
        '</length><x-coord>', x,
        '</x-coord><y-coord>', y,
        '</y-coord></process>'].join('');
  }

  initFromXML(node) {
    // NOTE: Do not set code while importing, as new code must be assigned!
    if(!IO_CONTEXT) this.code = nodeParameterValue(node, 'code');
    this.collapsed = nodeParameterValue(node, 'collapsed') === '1';
    this.integer_level = nodeParameterValue(node, 'integer-level') === '1';
    this.level_to_zero = nodeParameterValue(node, 'level-to-zero') === '1';
    this.equal_bounds = nodeParameterValue(node, 'equal-bounds') === '1';
    this.resize();
    this.comments = xmlDecoded(nodeContentByTag(node, 'notes'));
    this.lower_bound.text = xmlDecoded(nodeContentByTag(node, 'lower-bound'));
    this.upper_bound.text = xmlDecoded(nodeContentByTag(node, 'upper-bound'));
    // legacy models can have LB and UB hexadecimal data strings.
    this.convertLegacyBoundData(nodeContentByTag(node, 'lower-bound-data'),
        nodeContentByTag(node, 'upper-bound-data'));
    if(nodeParameterValue(node, 'reversible') === '1') {
      // For legacy "reversible" processes, the LB is set to -UB.
      this.lower_bound.text = '-' + this.upper_bound.text;
    }
    // NOTE: Legacy models have no initial level field => default to 0.
    const ilt = xmlDecoded(nodeContentByTag(node, 'initial-level'));
    this.initial_level.text = ilt || '0';
    // NOTE: Until version 1.0.16, pace was stored as a node parameter. 
    const pace_text = nodeParameterValue(node, 'pace') + 
        xmlDecoded(nodeContentByTag(node, 'pace'));
    // NOTE: Legacy models have no pace field => default to 1.
    this.pace_expression.text = pace_text || '1';
    // NOTE: Immediately evaluate pace expression as integer.
    this.pace = Math.max(1, Math.floor(this.pace_expression.result(1)));
    this.TEX_id = xmlDecoded(nodeContentByTag(node, 'tex-id') || 'p');
    this.power_grid = MODEL.powerGridByID(nodeContentByTag(node, 'grid-id'));
    this.length_in_km = safeStrToFloat(nodeContentByTag(node, 'length'), 0);
    // NOTE: Reactance may be an empty string to indicate "infer from length".
    this.reactance = nodeContentByTag(node, 'reactance');
    this.x = safeStrToInt(nodeContentByTag(node, 'x-coord'));
    this.y = safeStrToInt(nodeContentByTag(node, 'y-coord'));
    if(IO_CONTEXT) {
      // Record that this process was included.
      IO_CONTEXT.addedNode(this);
      // Contextualize the expressions.
      IO_CONTEXT.rewrite(this.lower_bound);
      IO_CONTEXT.rewrite(this.upper_bound);
      IO_CONTEXT.rewrite(this.initial_level);
      IO_CONTEXT.rewrite(this.pace_expression);
    }
  }
  
  setCluster(c) {
    // Place this process into the specified cluster `c`.
    // NOTE: A process must be part of exactly ONE cluster.
    if(this.cluster) {
      // Remove this process from its current cluster's process list.
      const i = this.cluster.processes.indexOf(this);
      if(i >= 0) this.cluster.processes.splice(i, 1);
      // Set its new cluster pointer...
      this.cluster = c;
      // ... and add it to the new cluster's process list.
      if(c.processes.indexOf(this) < 0) c.processes.push(this);
    }
  }
  
  doesConsume(p) {
    // Return the link P --> Q iff this process Q consumes product P.
    for(const l of this.inputs) if(l.from_node === p) return l;
    return null;
  }

  doesProduce(p) {
    // Return the link Q --> P iff this process Q produces product P.
    for(const l of this.outputs) if(l.to_node === p) return l;
    return null;
  }
  
  get defaultAttribute() {
    // Default attribute of processes is their level.
    return 'L';
  }

  attributeValue(a) {
    // Return the computed result for attribute `a`.
    // For processes, these are all vectors.
    if(a === 'L') return this.level;
    if(a === 'CF') return this.cash_flow;
    if(a === 'MCF') return this.marginal_cash_flow;
    if(a === 'CI') return this.cash_in;
    if(a === 'CO') return this.cash_out;
    if(a === 'CP') return this.cost_price;
    return null;
  }

  attributeExpression(a) {
    // Processes have four expression attributes.
    if(a === 'LB') return this.lower_bound;
    if(a === 'UB') {
      return (this.equal_bounds ? this.lower_bound : this.upper_bound);
    }
    if(a === 'LCF') return this.pace_expression;
    if(a === 'IL') return this.initial_level;
    return null;
  }

  // NOTE: DO NOT RENAME! use of underscore is intentional!
  // This "get" function ensures that processes also "answer" to checks
  // whether a node is a buffer.
  get is_buffer() {
    return false;
  }
  
  get totalAttributedCost() {
    // Return sum of Share-of-Cost percentages of the output links
    // of this process.
    let tac = 0;
    for(const l of this.outputs) tac += l.share_of_cost;
    return tac;
  }
  
  highestUpperBound() {
    // Return UB if static, otherwise +INF.
    const ub = (this.equal_bounds ? this.lower_bound : this.upper_bound);
    return (ub.isStatic ? ub.result(0) : VM.PLUS_INFINITY);
  }
  
  lossRates(t) {
    // Returns a list of loss rates for the slope variables associated
    // with this process at time t.
    // NOTE: Rates depend on upper bound, which may be dynamic.
    // Source: section 4.4 of Neumann et al. (2022) Assessments of linear
    // power flow and transmission loss approximations in coordinated
    // capacity expansion problem. Applied Energy, 314: 118859.
    // https://doi.org/10.1016/j.apenergy.2022.118859
    if(!(this.grid && this.grid.loss_approximation &&
        !this.ignore_power_losses)) return [0];
    let ub = this.upper_bound.result(t);
    if(ub >= VM.PLUS_INFINITY) {
      // When UB = +INF, this is interpreted as "unlimited", which is
      // implemented as 99999 grid power units.
      ub = VM.UNLIMITED_POWER_FLOW;
    }
    const
        la = this.grid.loss_approximation,
        // Let m be the highest per unit loss. 
        m = ub * this.grid.resistancePerKm * this.length_in_km;
    // Linear loss approximation: 1 slope from 0 to m.
    if(la === 1) return [m];
    // 2-slope approximation of quadratic curve.
    if(la === 2) return [m * 0.25, m * 0.75];
    // 3-slope approximation of quadratic curve.
    return [m / 9, m * 3/9, m * 5/9];
  }
  
  actualLossRate(t) {
    // Return the actual loss rate, which depends on the power flow
    // and the max. power flow (process UB).
    const g = this.grid;
    if(!g || this.ignore_power_losses) return 0;
    const
        lr = this.lossRates(t),
        apl = Math.abs(this.actualLevel(t)),
        ub = this.upper_bound.result(t),
        la = g.loss_approximation,
        // Prevent division by 0.
        slope = (ub < VM.NEAR_ZERO ? 0 :
            // NOTE: Index may exceed # slopes - 1 when level = UB.
            Math.min(la - 1, Math.floor(apl * la / ub)));
    return lr[slope];
  }
  
  copyPropertiesFrom(p) {
    // Set properties to be identical to those of process `p`
    this.x = p.x;
    this.y = p.y;
    this.comments = p.comments;
    this.lower_bound.text = p.lower_bound.text;
    this.upper_bound.text = p.upper_bound.text;
    this.initial_level.text = p.initial_level.text;
    this.integer_level = p.integer_level;
    this.pace_expression = p.pace_expression;
    this.equal_bounds = p.equal_bounds;
    this.level_to_zero = p.level_to_zero;
    this.collapsed = p.collapsed;
    this.TEX_id = p.TEX_id;
  }

  differences(p) {
    // Return "dictionary" of differences, or NULL if none
    const
        d = differences(this, p, UI.MC.PROCESS_PROPS),
        cn = (this.cluster ? this.cluster.displayName : ''),
        pcn = (p.cluster ? p.cluster.displayName : '');
    if(cn !== pcn) d.cluster = {A: cn, B: pcn};
    if(Object.keys(d).length > 0) return d;
    return null;
  }
  
  get TEXcode() {
    // Return LaTeX code for mathematical formula of constraints defined
    // by this process.
    const
        NL = '\\\\\n',
        tex = [NL],
        sub = (MODEL.start_period !== MODEL.end_period ?
            '_{' + this.TEX_id + ',t}' : '_' + this.TEX_id),
        lb = (this.lower_bound.defined ? 'LB' + sub + ' \\le' : ''),
        ub = (this.upper_bound.defined ? '\\le UB' + sub : '');
    // Integer constraint if applicable.
    if(this.integer_level) tex.push('x' + sub, '\\in \\mathbb{Z}', NL);
    // Bound constraints...
    if(lb && this.equal_bounds) {
      tex.push('x' + sub, '= LB' + sub);      
    } else if(lb || ub) {
      tex.push(lb, 'x' + sub, ub);
    }
    // ... with semi-continuity if applicable. 
    if(lb && this.level_to_zero) tex.push('\\vee x' + sub, '= 0');
    tex.push(NL);
    // Add equations for associated binary variables.
    tex.push(this.TEXforBinaries);
    return tex.join(' ');
  }

} // END of class Process


// CLASS Product
class Product extends Node {
  constructor(cluster, name, actor) {
    super(cluster, name, actor);
    this.scale_unit = MODEL.default_unit;
    // By default, processes have the letter p, products the letter q.
    this.TEX_id = 'p';
    // For products, the default bounds are [0, 0], and modeler-defined bounds
    // typically are equal.
    this.equal_bounds = true;
    // In addition to LB, UB and IL, products has 1 input attribute: P.
    this.price = new Expression(this, 'P', '');
    // Products have a highest cost price, and may have a stock price (if storage).
    this.highest_cost_price = [];
    this.stock_price = [];
    // Stock level changing from 0 to positive counts as "start up", while
    // changing from positive to 0 counts as a "shut-down".
    // NOTE: Being relatively rare, start_ups and shut_downs are not vectors,
    // but store the numbers of the time steps in which they occurred.
    this.start_ups = [];
    this.shut_downs = [];
    // Modeler may set explicit properties.
    this.is_source = false;
    this.is_sink = false;
    this.is_buffer = false;
    this.is_data = false;
    this.no_slack = false;
    this.no_links = false;
  }

  setCode() {
    // Products are assigned a unique letter code for shorthand display of links
    if(!this.code) {
      this.code = MODEL.newProductCode;
    }
  }

  get type() {
    return 'Product';
  }
  
  get typeLetter() {
    return 'Q';
  }
  
  get grid() {
    return null;
  }
  
  get attributes() {
    const a = {name: this.displayName};
    a.LB = this.lower_bound.asAttribute;
    a.UB = (this.equal_bounds ? a.LB : this.upper_bound.asAttribute);
    a.IL = this.initial_level.asAttribute;
    a.P = this.price.asAttribute;
    if(MODEL.solved) {
      const t = MODEL.t;
      a.L = this.level[t];
      if(MODEL.infer_cost_prices) {
        a.CP = this.cost_price[t];
        a.HCP = this.highest_cost_price[t];
        // Highest cost price may be undefined if product has no inflows. 
        if(a.HCP === VM.MINUS_INFINITY) a.HCP = '';
      }
    }
    return a;
  }
  
  get positionInFocalCluster() {
    // Return product position object for this product if it is shown in the
    // focal cluster, or NULL otherwise
    let i = MODEL.focal_cluster.indexOfProduct(this);
    if(i < 0) return null;
    return MODEL.focal_cluster.product_positions[i];
  }
  
  get allLinksIgnored() {
    // Return TRUE iff all input links are ignored AND all "regular" output
    // links (i.e., inputs of a process) are ignored.
    for(const l of this.inputs) {
      if(!MODEL.ignored_entities[l.identifier]) return false;
    }
    for(const l of this.outputs) {
      if(l.to_node instanceof Process &&
          !MODEL.ignored_entities[l.identifier]) return false;
    }
    return true;
  }

  allLinksInCluster(c) {
    // Return TRUE iff this product is linked only to processes in
    // cluster `c`.
    // NOTE: If this is TRUE, deleting this product from this cluster
    // will delete it from the model as well.
    let n;
    for(const l of this.inputs) {
      n = l.from_node;
      if(n instanceof Product && c.indexOfProduct(n) < 0 ||
         n instanceof Process && n.cluster !== c) {
        return false;
      }
    }
    for(const l of this.outputs) {
      n = l.to_node; 
      if(n instanceof Product && c.indexOfProduct(n) < 0 ||
         n instanceof Process && n.cluster !== c) {
        return false;
      }
    }
    return true;
  }
  
  get allInputsAreFeedback() {
    // Return TRUE if all input links of this product are feedback links.
    // NOTE: This is used to determine whether a product is an implicit source.
    for(const l of this.inputs) if(!l.is_feedback) return false;
    return true;
  }

  get hasDataInputs() {
    // Return TRUE if product has input links that are data links.
    for(const l of this.inputs) {
      if(l.multiplier || l.from_node instanceof Product) return true;
    }
    return false;
  }

  get allOutputsAreData() {
    // Return TRUE if all output links that are data links.
    // NOTE: This requires that the product has no links to processes.
    for(const l of this.outputs) {
      if(l.to_node instanceof Process) return false;
    }
    return true;
  }
  
  get isConstant() {
    // Return TRUE if this product is data, is not an actor cash flow,
    // has no ingoing links, has outgoing links ONLY to data objects,
    // and has set LB = UB.
    if(!this.is_data || this.name.startsWith('$') ||
        this.inputs.length || !this.allOutputsAreData) return false;
    return (this.equal_bounds && this.lower_bound.defined);
  }

  get isSourceNode() {
    // Returns TRUE if this product behaves as a source.
    return (this.is_source || this.inputs.length === 0) &&
      !this.lower_bound.defined;
  }

  get isSinkNode() {
    // Return TRUE if this product behaves as a sink.
    return (this.is_sink || this.allOutputsAreData) &&
      !(this.upper_bound.defined ||
        // NOTE: UB may be set by equalling it to LB.
        (this.equal_bounds && this.lower_bound.defined));
  }
  
  highestUpperBound(visited) {
    // Infer the upper bound for this product from its own UB, or from
    // its ingoing links (type, rate, and UB of their from nodes).
    // This is used while compiling the VM instructions that compute the
    // ON/OFF binary variable for this product.
    // This method performs a graph traversal. If this product is part
    // of a cycle in the graph, its highest UB co-depends on its own UB,
    // which is not constrained, so then return +INF.
    // No need to check for sink nodes, as even on those nodes a max. UB
    // might be inferred from their max. inflows.
    if(visited.indexOf(this) >= 0) return VM.PLUS_INFINITY;
    let ub = (this.equal_bounds ? this.lower_bound : this.upper_bound);
    // If dynamic expression, return +INF to signal "no lower UB can be inferred".
    if(ub.defined && !ub.isStatic) return VM.PLUS_INFINITY;
    // If static, use its value as initial highest value.
    const max_ub = (ub.defined ? ub.result(0) : VM.PLUS_INFINITY);
    // See if the sum of its max. inflows will be lower than this value.
    let sum = 0;
    // Preclude infinite recursion.
    visited.push(this);
    for(const l of this.inputs) {
      const
          r = l.relative_rate,
          fn = l.from_node;
      // Dynamic rate => inflows cannot constrain the UB any further.
      if(!r.isStatic) return max_ub;
      let rate = r.result(0);
      if([VM.LM_STARTUP, VM.LM_POSITIVE, VM.LM_ZERO, VM.LM_FIRST_COMMIT,
            VM.LM_SHUTDOWN].indexOf(l.multiplier) >= 0) {
        // For binary multipliers, the rate is the highest possible flow.
        // NOTE: Do not add negative flows, as actual flow may be 0.
        sum += Math.max(0, rate);
      } else {
        // For other multipliers, max flow = rate * UB of the FROM node.
        // For products, this will recurse; processes return their UB.
        let fnub = fn.highestUpperBound(visited);
        // If +INF, no lower UB can be inferred => return initial maximum
        if(fnub >= VM.PLUS_INFINITY) return max_ub;
        // Otherwise, add rate * UB to the max. total inflow.
        // NOTE: For SUM multipliers, also consider the delay.
        if(l.multiplier === VM.LM_SUM) {
          rate *= Math.max(1, l.flow_delay.result(0));
        }
        // NOTE: Do not add negative flows, as actual flow may be 0.
        sum += Math.max(0, rate * fnub);
      }
    }
    // Return the sum of max. inflows as the lowest max. UB, or the initial
    // maximum if that was lower.
    return Math.min(sum, max_ub);
  }

  noInflows(t) {
    // Return TRUE iff this product has no inflows that might affect cost price.
    for(const l of this.inputs) if(l.actualFlow(t) > 0) return false;
    for(const l of this.outputs) if(l.actualFlow(t) < 0) return false;
    return true;
  }
  
  stockPrice(t) {
    // Return the stock price if this product has storage capacity.
    if(this.is_buffer && t >= 0 && t < this.stock_price.length) {
      return (t ? this.stock_price[t] : 0);
    }
    return VM.UNDEFINED;
  }
  
  calculateHighestCostPrice(t) {
    // Set the highest cost price (HCP) for this product to be the cost
    // price of the most expensive process that in time step t contributes
    // to the level of this product.
    let hcp = VM.MINUS_INFINITY;
    for(const l of this.inputs) {
      if(l.from_node instanceof Process && l.actualFlow(t) > VM.NEAR_ZERO) {
        const ld = l.actualDelay(t);
        // NOTE: Only consider the allocated share of cost.
        let cp = l.from_node.costPrice(t - ld) * l.share_of_cost;
        // NOTE: Ignore undefined cost prices.
        if(cp <= VM.PLUS_INFINITY) {
          const rr = l.relative_rate.result(t - ld);
          if(Math.abs(rr) < VM.NEAR_ZERO) {
            cp = (rr < 0 && cp < 0 || rr > 0 && cp > 0 ?
                VM.PLUS_INFINITY : VM.MINUS_INFINITY);
          } else {
            cp = cp / rr;
          }
          hcp = Math.max(hcp, cp);
        }
      }
    }
    this.highest_cost_price[t] = hcp;
  }
  
  highestCostPrice(t) {
    // Return the unit cost price of the most expensive process that
    // provides input to this product in time step t.
    if(this.is_buffer && t >= 0 && t < this.highest_cost_price.length) {
      return this.highest_cost_price[t];
    }
    return VM.UNDEFINED;
  }
  
  get asXML() {
    let n = this.name,
        cmnts = xmlEncoded(this.comments),
        x = this.x,
        y = this.y,
        p = ` code="${this.code}"`;
    if(this.is_buffer) p += ' is-buffer="1"';
    if(this.is_source) p += ' is-source="1"';
    if(this.is_sink) p += ' is-sink="1"';
    if(this.is_data) p += ' is-information="1"';
    if(this.equal_bounds) p += ' equal-bounds="1"';
    if(this.integer_level) p += ' integer-level="1"';
    if(this.no_slack) p += ' no-slack="1"';
    if(this.no_links) p += ' no-links="1"';
    const id = UI.nameToID(n);
    if(MODEL.black_box_entities.hasOwnProperty(id)) {
      // NOTE: "black-boxed" products are saved anonymously without comments
      // or their (X, Y) position (which is redundant anyway).
      n = MODEL.black_box_entities[id];
      cmnts = '';
      x = 0;
      y = 0;
    }
    let xml = `<product${p}><name>${xmlEncoded(n)}</name>`;
    // NOTE: Only products having storage can have initial level.
    if(this.is_buffer) {
      xml += `<initial-level>${this.initial_level.asXML}</initial-level>`;
    }
    xml += ['<unit>', xmlEncoded(this.scale_unit),
      '</unit><notes>', cmnts,
      '</notes><upper-bound>', this.upper_bound.asXML,
      '</upper-bound><lower-bound>', this.lower_bound.asXML,
      '</lower-bound><price>', this.price.asXML,
      '</price><x-coord>', x,
      '</x-coord><y-coord>', y,
      '</y-coord><tex-id>', this.TEX_id,
      '</tex-id></product>'].join('');
    return xml;
  }

  initFromXML(node) {
    // NOTE: Do not set code while importing, as new code must be assigned!
    if(!IO_CONTEXT) this.code = nodeParameterValue(node, 'code');
    this.is_buffer = nodeParameterValue(node, 'is-buffer') === '1';
    this.is_source = nodeParameterValue(node, 'is-source') === '1';
    this.is_sink = nodeParameterValue(node, 'is-sink') === '1';
    this.is_data = nodeParameterValue(node, 'is-information') === '1';
    this.equal_bounds = nodeParameterValue(node, 'equal-bounds') === '1';
    this.integer_level = nodeParameterValue(node, 'integer-level') === '1';
    this.no_slack = nodeParameterValue(node, 'no-slack') === '1';
    // Legacy models have tag "hidden" instead of "no-links".
    this.no_links = (nodeParameterValue(node, 'no-links') ||
        nodeParameterValue(node, 'hidden')) === '1';
    this.scale_unit = MODEL.addScaleUnit(
        xmlDecoded(nodeContentByTag(node, 'unit')));
    this.TEX_id = xmlDecoded(nodeContentByTag(node, 'tex-id') || 'q');
    // Legacy models have tag "profit" instead of "price".
    let pp = nodeContentByTag(node, 'price');
    if(!pp) pp = nodeContentByTag(node, 'profit');
    this.price.text = xmlDecoded(pp);
    // Legacy models can have price time series data as hexadecimal string.
    this.convertLegacyPriceData(nodeContentByTag(node, 'profit-data'));
    this.lower_bound.text = xmlDecoded(nodeContentByTag(node, 'lower-bound'));
    this.upper_bound.text = xmlDecoded(nodeContentByTag(node, 'upper-bound'));
    // Legacy models can have LB and UB hexadecimal data strings.
    this.convertLegacyBoundData(nodeContentByTag(node, 'lower-bound-data'),
        nodeContentByTag(node, 'upper-bound-data'));
    // NOTE: Legacy models have no initial level field => default to 0.
    const ilt = xmlDecoded(nodeContentByTag(node, 'initial-level'));
    this.initial_level.text = ilt || '0';
    this.comments = xmlDecoded(nodeContentByTag(node, 'notes'));
    this.x = safeStrToInt(nodeContentByTag(node, 'x-coord'));
    this.y = safeStrToInt(nodeContentByTag(node, 'y-coord'));
    if(IO_CONTEXT) {
      // Record that this product was included.
      IO_CONTEXT.addedNode(this);
      // Contextualize the expressions.
      IO_CONTEXT.rewrite(this.price);
      IO_CONTEXT.rewrite(this.lower_bound);
      IO_CONTEXT.rewrite(this.upper_bound);
      IO_CONTEXT.rewrite(this.initial_level);
    }
    this.resize();
  }

  convertLegacyPriceData(data) {
    // Convert time series data for prices in legacy models to a dataset,
    // and replace the price expression by a reference to this dataset.
    if(data) {
      const
          dsn = this.displayName + ' PRICE DATA',
          ds = MODEL.addDataset(dsn);
      // Use the price attribute as default value for the dataset.
      ds.default_value = parseFloat(this.price.text);
      // NOTE: Dataset unit then is a currency.
      ds.scale_unit = MODEL.currency_unit;
      ds.data = stringToFloatArray(data);
      ds.computeVector();
      ds.computeStatistics();
      this.price.text = `[${dsn}]`;
      MODEL.legacy_datasets = true;
    }
  }

  get defaultAttribute() {
    // Products have their level as default attribute.
    return 'L';
  }

  attributeValue(a) {
    // Return the computed result for attribute `a`.
    // NOTE: For products, this is always a vector except IL.
    if(a === 'L') return this.level;
    if(a === 'CP') return this.cost_price;
    if(a === 'HCP') return this.highest_cost_price;
    return null;
  }

  attributeExpression(a) {
    // Products have four expression attributes.
    if(a === 'LB') return this.lower_bound;
    if(a === 'UB') {
      return (this.equal_bounds ? this.lower_bound : this.upper_bound);
    }
    if(a === 'IL') return this.initial_level;
    if(a === 'P') return this.price;
    return null;
  }

  changeScaleUnit(name) {
    // Change the scale unit for this product to `name`.
    let su = MODEL.addScaleUnit(name);
    if(su !== this.scale_unit) {
      this.scale_unit = su;
      this.resize();
      MODEL.cleanUpScaleUnits();
    }
  }
  
  get productPositionClusters() {
    // Return the list of ALL clusters in which this product is positioned.
    const ppc = [];
    for(let k in MODEL.clusters) if(MODEL.clusters.hasOwnProperty(k)) {
      const c = MODEL.clusters[k];
      if(c.indexOfProduct(this) >= 0) ppc.push(c);
    }
    return ppc;
  }
  
  get toBeBlackBoxed() {
    // Return TRUE if this product occurs only in "black box" clusters.
    for(const c of this.productPositionClusters) if(!c.blackBoxed) return false;
    return true;
  }

  occursOutsideCluster(c) {
    // Return TRUE iff this product has a position in any cluster that is
    // not `c` nor contained in `c`.
    for(let k in MODEL.clusters) if(MODEL.clusters.hasOwnProperty(k)) {
      const cc = MODEL.clusters[k];
      if((cc !== c) && !c.containsCluster(cc) && (cc.indexOfProduct(this) >= 0)) {
        return true;
      }
    }
    return false;
  }

  setPositionInFocalCluster(x=null, y=null) {
    // Set X and Y of this product to its position in the focal cluster.
    // (OPTIONAL: after changing it to specified values `x` and `y`)
    const i = MODEL.focal_cluster.indexOfProduct(this);
    if(i < 0) return null;
    const pp = MODEL.focal_cluster.product_positions[i];
    // Set new product position coordinates if specified.
    if(x && y) {
      pp.x = x;
      pp.y = y;
    }
    // Set product's X and Y to its position in the focal cluster.
    this.x = pp.x;
    this.y = pp.y;
    return pp;
  }

  movePositionInFocalCluster(dx, dy) {
    // Sets X and Y of this product to its position in the focal cluster
    // after changing it (relative to current position).
    const i = MODEL.focal_cluster.indexOfProduct(this);
    if(i < 0) return null;
    const pp = MODEL.focal_cluster.product_positions[i];
    // Set new product position coordinates.
    pp.x += dx;
    pp.y += dy;
    // Set product's X and Y to its position in the focal cluster.
    this.x = pp.x;
    this.y = pp.y;
    return pp;
  }

  copyPropertiesFrom(p) {
    // Set properties to be identical to those of product `p`.
    this.x = p.x;
    this.y = p.y;
    this.comments = p.comments;
    this.lower_bound.text = p.lower_bound.text;
    this.upper_bound.text = p.upper_bound.text;
    this.scale_unit = p.scale_unit;
    this.equal_bounds = p.equal_bounds;
    this.price.text = p.price.text;
    this.is_source = p.is_source;
    this.is_sink = p.is_sink;
    this.is_buffer = p.is_buffer;
    this.is_data = p.is_data;
    this.no_slack = p.no_slack;
    this.initial_level.text = p.initial_level.text;
    this.integer_level = p.integer_level;
    this.TEX_id = p.TEX_id;
    // NOTE: Do not copy the `no_links` property, nor the import/export status.
  }

  differences(p) {
    // Return "dictionary" of differences, or NULL if none.
    const d = differences(this, p, UI.MC.PRODUCT_PROPS);
    if(Object.keys(d).length > 0) return d;
    return null;
  }

  get TEXcode() {
    // Return LaTeX code for mathematical formula of constraints defined
    // by this product.
    const
        NL = '\\\\\n',
        tex = [NL],
        x = (this.level_to_zero ? '\\hat{x}' : 'x'),
        dyn = (MODEL.start_period !== MODEL.end_period),
        sub = (dyn ? '_{' + this.TEX_id + ',t}' : '_' + this.TEX_id),
        param = (x, p) => {
            if(!x.defined) return '';
            const v = safeStrToFloat(x.text, p + sub);
            if(typeof v === 'number') return VM.sig4Dig(v);
            return v;
          };
    // Integer constraint if applicable.
    if(this.integer_level) tex.push(x + sub, '\\in \\mathbb{Z}', NL);
    // Bounds can be explicit...
    let lb = param(this.lower_bound, 'LB'),
        ub = param(this.upper_bound, 'UB');
    if(lb && this.equal_bounds) ub = lb;
    // ... or implicit.
    if(!lb && !this.isSourceNode) lb = '0';
    if(!ub && !this.isSinkNode) ub = '0';
    // Add the bound constraints.
    if(lb && ub) {
      if(lb === ub) {
        tex.push(x + sub, '=', lb, NL);
      } else {
        tex.push(lb, '\\le ' + x + sub, '\\le', ub, NL);
      }
    } else if(lb) {
      tex.push(x + sub, '\\ge', lb, NL);
    } else if(ub) {
      tex.push(x + sub, '\\le', ub, NL);      
    }
    // Add the "balance" constraint for links.
    tex.push(x + sub, '=');
    if(this.is_buffer) {
      // Insert X[t-1].
      tex.push(x + '_{' + this.code + (dyn ? ',t-1}' : ',0}'));
    }
    let first = true;
    for(const l of this.inputs) {
      let ltex = l.TEXcode.trim();
      if(!first && !ltex.startsWith('-')) tex.push('+');
      tex.push(ltex);
      first = false;
    }
    for(const l of this.outputs) {
      let ltex = l.TEXcode.trim();
      if(ltex.trim().startsWith('-')) {
        if(!first) {
          ltex = ltex.substring(1);
          ltex = '- ' + ltex;
          first = false;
        }
      } else {
        ltex = '- ' + ltex;        
      }
      tex.push(ltex);
    }
    return tex.join(' ');
  }
  
} // END of class Product


// CLASS ProductPosition (placeholder for product within a cluster)
class ProductPosition {
  constructor(cluster, product) {
    this.cluster = cluster;
    this.product = product;
    this.x = product.x;
    this.y = product.y;
  }
  
  get asXML() {
    return ['<product-position><product-name>',
      xmlEncoded(this.product.displayName),
      '</product-name><x-coord>', this.x,
      '</x-coord><y-coord>', this.y,
      '</y-coord></product-position>'].join('');
  }

  initFromXML(node) {
    this.x = safeStrToInt(nodeContentByTag(node, 'x-coord'));
    this.y = safeStrToInt(nodeContentByTag(node, 'y-coord'));
  }
  
  alignToGrid() {
    const
        ox = this.x,
        oy = this.y;
    this.x = MODEL.aligned(this.x);
    this.y = MODEL.aligned(this.y);
    this.product.x = this.x;
    this.product.y = this.y;
    return Math.abs(this.x - ox) > VM.NEAR_ZERO ||
        Math.abs(this.y - oy) > VM.NEAR_ZERO;
  }

} // END of class ProductPosition


// CLASS Link (connecting arrow in diagram)
class Link {
  constructor (from, to) {
    this.comments = '';
    this.from_node = from;
    this.to_node = to;
    // links to "information products" can be defined to calculate the actual flow
    // by multiplying the rate with different variables:
    //   level:      X[t] (DEFAULT, no symbol)
    //   throughput: the sum of inflows if X is a product  (double right arrow)
    //   increase:   X[t] - X[t-1]  (capital delta)
    //   sum:        the total of X[t - delay] through X[t]  (captial sigma)
    //   mean:       the average of X[t - delay] through X[t]  (mu)
    //   start-up:   1 if X[t-1] = 0 AND X[t] > 0, otherwise 0  (chevron up)
    //   positive:   1 if X[t] > 0, otherwise 0  (circled +)
    //   zero:       1 if X[t] = 0, otherwise 0  (circled o)
    //   shut-down:  1 if X[t-1] > 0 AND X[t] = 0, otherwise 0  (chevron down)
    //   spin-res:   "spinning reserve" if X is a process, i.e., 0 if X[t] = 0,
    //               otherwise the remaining capacity, i.e., UB[t] - X[t]
    //               (curved arrow up)
    //   first-comm: 1 if X[t] > 0 AND X[i] = 0 for all i < t (asterisk)
    this.multiplier = VM.LM_LEVEL; 
    // Links have 3 input attributes: rate vector R, and single values D (delay)
    // and SOC (share of cost)
    // NOTE: relative rate can be negative only if TO node is information
    this.relative_rate = new Expression(this, 'R', '1');
    this.flow_delay = new Expression(this, 'D', '0');
    // NOTE: by default, no share of cost
    this.share_of_cost = 0;
    // Links have 1 result attribute: F (computed as relative rate * multiplier)
    this.actual_flow = [];
    // NOTE: unit cost price is used only temporarily during cost price calculation
    this.unit_cost_price = 0;
    // other properties are used for drawing, editing, etc.
    this.from_x = 0;
    this.from_y = 0;
    this.to_x = 0;
    this.to_y = 0;
    this.is_feedback = false;
    this.visited = false;
    this.selected = false;
    // NOTE: links do not have their own shape, as they are represented by arrows
  }

  get type() {
    return 'Link';
  }

  get typeLetter() {
    return 'L';
  }

  get displayName() {
    return this.from_node.displayName + UI.LINK_ARROW + this.to_node.displayName;
  }

  get identifier() {
    // NOTE: Link IDs are based on the node codes rather than IDs, as this
    // prevents problems when nodes are renamed.
    return this.from_node.code + '___' + this.to_node.code;
  }

  get attributes() {
    // NOTE: Link is named by its tab-separated node names.
    const a = {name: this.from_node.displayName + '\t' + this.to_node.displayName};
    a.R = this.relative_rate.asAttribute;
    if(MODEL.infer_cost_prices) a.SOC = this.share_of_cost;
    a.D = this.flow_delay.asAttribute;
    if(MODEL.solved) a.F = this.actual_flow[MODEL.t];
    return a;
  }
  
  get dataOnly() {
    // A link is data-only if multiplier is "special", or TO node is data
    return (this.multiplier != VM.LM_LEVEL || this.to_node.is_data);
  }
  
  get numberContext() {
    // Returns the string to be used to evaluate # (empty string if undefined)
    let fn = this.from_node,
        tn = this.to_node;
    // For links, the process node is checked first, then the product node
    if(this.to_node instanceof Process) {
      fn = this.to_node;
      tn = this.from_node;
    }
    // Otherwise, the FROM node is checked first
    let nc = fn.numberContext;
    if(!nc) nc = tn.numberContext;
    return nc;
  }
    
  get asXML() {
    // NOTE: sanitize! somehow links of type X -> X appear
    if(this.from_node === this.to_node) return '';
    let fn = this.from_node.name,
        tn = this.to_node.name,
        cmnts = xmlEncoded(this.comments);
    const
        fid = UI.nameToID(fn +
            (this.from_node.hasActor ? ` (${this.from_node.actor.name})` : '')),
        tid = UI.nameToID(tn +
            (this.to_node.hasActor ? ` (${this.to_node.actor.name})` : ''));
    // NOTE: "black-boxed" links are saved anonymously without comments
    if(MODEL.black_box_entities.hasOwnProperty(fid)) {
      fn = MODEL.black_box_entities[fid];
      cmnts = '';
    }
    if(MODEL.black_box_entities.hasOwnProperty(tid)) {
      tn = MODEL.black_box_entities[tid];
      cmnts = '';
    }
    let p = (this.multiplier ? ` multiplier="${this.multiplier}"` : '');
    if(this.is_feedback) p += ' is-feedback="1"';
    return ['<link', p, '><from-name>', xmlEncoded(fn),
      '</from-name><from-owner>', xmlEncoded(this.from_node.actor.name),
      '</from-owner><to-name>', xmlEncoded(tn),
      '</to-name><to-owner>', xmlEncoded(this.to_node.actor.name),
      '</to-owner><relative-rate>', this.relative_rate.asXML,
      '</relative-rate><delay>', this.flow_delay.asXML,
      '</delay><share-of-cost>', this.share_of_cost,
      '</share-of-cost><notes>', cmnts,
      '</notes></link>'].join('');
  }

  initFromXML(node) {
    this.multiplier = safeStrToInt(nodeParameterValue(node, 'multiplier'));
    this.is_feedback = nodeParameterValue(node, 'is-feedback') === '1';
    this.relative_rate.text = xmlDecoded(
        nodeContentByTag(node, 'relative-rate'));
    // NOTE: legacy models have no flow delay field => default to 0
    const fd_text = xmlDecoded(nodeContentByTag(node, 'delay'));
    this.flow_delay.text = fd_text || '0';
    this.share_of_cost = safeStrToFloat(
        nodeContentByTag(node, 'share-of-cost'), 0);
    if(!fd_text) {
    // NOTE: default share-of-cost for links in legacy Linny-R was 100%;
    //       this is dysfunctional in JS Linny-R => set to 0 if equal to 1
      if(this.share_of_cost == 1) this.share_of_cost = 0;
    }
    this.comments = xmlDecoded(nodeContentByTag(node, 'notes'));
    if(IO_CONTEXT) {
      // Record that this link was included
      IO_CONTEXT.addedLink(this);
      // Contextualize the rate and delay expressions
      IO_CONTEXT.rewrite(this.relative_rate);
      IO_CONTEXT.rewrite(this.flow_delay);
    }
  }

  get defaultAttribute() {
    // For links, the default attribute is their actual flow
    return 'F';
  }

  attributeValue(a) {
    // Returns the computed result for attribute a (for links, only F is a vector)
    if(a === 'F') return this.actual_flow; // vector
    if(a === 'SOC') return this.share_of_cost; // number
    return null;
  }

  attributeExpression(a) {
    // Links have two expression attributes
    if(a === 'R') return this.relative_rate;
    if(a === 'D') return this.flow_delay;
    return null;
  }
  
  actualDelay(t) {
    // Scale the delay expression value of this link to a discrete number
    // of time steps on the model time scale.
    // NOTE: For links from grid processes, delays are ignored.
    if(this.from_node.grid) return 0;
    let d = Math.floor(VM.SIG_DIF_FROM_ZERO + this.flow_delay.result(t));
    // NOTE: Negative values are permitted. This might invalidate cost
    // price calculation -- to be checked!!
    return d;
  }
  
  actualFlow(t) {
    if(t >= 0 && t < this.actual_flow.length) return this.actual_flow[t];
    return VM.UNDEFINED;
  }

  copyPropertiesFrom(l) {
    // Set properties to be identical to those of link `l`
    this.comments = l.comments;
    this.multiplier = l.multiplier;
    this.relative_rate.text = l.relative_rate.text;
    this.share_of_cost = l.share_of_cost;
    this.flow_delay.text = l.flow_delay.text;
  }
  
  differences(l) {
    // Return "dictionary" of differences, or NULL if none
    const d = differences(this, l, UI.MC.LINK_PROPS);
    if(Object.keys(d).length > 0) return d;
    return null;
  }

  get hasArrow() {
    // Returns TRUE iff both nodes are visible in the focal cluster
    const fc = MODEL.focal_cluster;
    if((this.from_node instanceof Process ? fc.containsProcess(this.from_node) :
            fc.containsProduct(this.from_node)) &&
        (this.to_node instanceof Process ? fc.containsProcess(this.to_node) :
            fc.containsProduct(this.to_node))) return true;
    return false;
  }
  
  get TEXcode() {
    // Return LaTeX code for the term for this link in the formula
    // for its TO node if this is a product. The TEX routines for
    // products will take care of the sign of this term.
    const
        dyn = MODEL.start_period !== MODEL.end_period,
        n1 = (this.to_node instanceof Process ? this.to_node : this.from_node),
        n2 = (n1 === this.to_node ? this.from_node: this.to_node),
        x = (n1.level_to_zero ? '\\hat(x)' : 'x'),
        fsub = (dyn ? '_{' + n1.TEX_id + ',t}' : '_' + n1.TEX_id),
        fsub_i = fsub.replace(',t}', ',i}'),
        rs = n1.TEX_id + ' \\rightarrow ' + n2.TEX_id,
        rsub = (dyn ? '_{' + rs + ',t}' : '_' + rs),
        param = (x, p, sub) => {
            if(!x.defined) return '';
            const v = safeStrToFloat(x.text, p + sub);
            if(typeof v === 'number') return (v === 1 ? '' :
                (v === -1 ? '-' : VM.sig4Dig(v)));
            return v;
          },
        r = param(this.relative_rate, 'R', rsub),
        d = param(this.flow_delay, '\\delta', rsub),
        dn = safeStrToInt(d, '?'),
        d_1 = (!d || typeof dn === 'number' ? dn + 1 : d + '+1');
    if(this.multiplier === VM.LM_LEVEL) {
      return r + ' ' + x + fsub;
    } else if(this.multiplier === VM.LM_THROUGHPUT) {
      return 'THR';
    } else if(this.multiplier === VM.LM_INCREASE) {
      return 'INC';
    } else if(this.multiplier === VM.LM_SUM) {
      if(d) return r + '\\sum_{i=t-' + d + '}^{t}{' + x + fsub_i + '}';
      return x + fsub;
    } else if(this.multiplier === VM.LM_MEAN) {
      if(d) return r + '{1 \\over {' + d_1 + '}} \sum_{i=t-' +
          d + '}^{t}{' + x + fsub_i + '}';
      return x + fsub;
    } else if(this.multiplier === VM.LM_STARTUP) {
      return r + ' \\mathbf{su}' + fsub;
    } else if(this.multiplier === VM.LM_POSITIVE) {
      return r + '\\mathbf{u}' + fsub;
    } else if(this.multiplier === VM.LM_ZERO) {
      return r + '\\mathbf{d}' + fsub;    
    } else if(this.multiplier === VM.LM_SPINNING_RESERVE) {
      return 'SPIN';
    } else if(this.multiplier === VM.LM_FIRST_COMMIT) {
      return r + '\\mathbf{fc}' + fsub;    
    } else if(this.multiplier === VM.LM_SHUTDOWN) {
      return r + '\\mathbf{sd}' + fsub;    
    } else if(this.multiplier === VM.LM_PEAK_INC) {
      return 'PEAK';
    }
    return 'Unknown link multiplier: ' + this.multiplier;
  }

  // NOTE: links do not draw themselves; they are visualized by Arrow objects
  
}  // END of class Link


// CLASS DatasetModifier
class DatasetModifier {
  constructor(dataset, selector) {
    this.dataset = dataset;
    this.selector = selector;
    this.expression = new Expression(dataset, selector, '');
    this.outcome_equation = false;
  }
  
  get type() {
    // NOTE: when "found" by Finder, dataset modifiers will always be equations 
    return 'Equation';
  }
  
  get typeLetter() {
    return 'E';
  }
  
  get attributes() {
    // NOTE: property letter is X (exceptional case)
    return {name: this.displayName, X: this.expression.asAttribute};
  }
  
  get identifier() {
    // NOTE: Identifier will be unique only for equations.
    return UI.nameToID(this.selector);
  }

  get displayName() {
    // NOTE: When "displayed", dataset modifiers have their selector as name.
    return this.selector;
  }
  
  get asXML() {
    // NOTE: For some reason, selector may become empty string, so prevent
    // saving such unidentified modifiers.
    if(this.selector.trim().length === 0) return '';
    const oe = (this.outcome_equation ? ' outcome="1"' : '');
    return ['<modifier', oe, '><selector>', xmlEncoded(this.selector),
      '</selector><expression>', xmlEncoded(this.expression.text),
      '</expression></modifier>'].join('');
  }

  initFromXML(node) {
    // NOTE: Up to version 1.6.2, all equations were considered as
    // outcomes. To maintain upward compatibility, check for the model
    // version number.
    if(earlierVersion(MODEL.version, '1.6.3')) {
      this.outcome_equation = true;
    } else {
      this.outcome_equation = nodeParameterValue(node, 'outcome') === '1';
    }
    this.expression.text = xmlDecoded(nodeContentByTag(node, 'expression'));
    if(IO_CONTEXT) {
      // Contextualize the included expression.
      IO_CONTEXT.rewrite(this.expression);
    }
  }

  get hasWildcards() {
    // Return TRUE if this modifier contains wildcards.
    return this.dataset.isWildcardSelector(this.selector);
  }

  get numberContext() {
    // Return the string to be used to evaluate #.
    // NOTE: If the selector contains wildcards, return "?" to indicate
    // that the value of # cannot be inferred at compile time. 
    if(this.hasWildcards) return '?'; 
    // Otherwise, return the "tail number" of the selector, or if the
    // selector has no tail number, return the number context of the
    // dataset of this modifier.
    return UI.tailnumber(this.name) || this.dataset.numberContext;
  }

  match(s) {
    // Return TRUE if string `s` matches with the wildcard pattern of
    // the selector.
    if(!this.hasWildcards) return s === this.selector;
    let re;
    if(this.dataset === MODEL.equations_dataset) {
      // Equations wildcards only match with digits.
      re = wildcardMatchRegex(this.selector, true);
    } else {
      // Selector wildcards match with any character, so replace ? by .
      // (any character) in pattern, and * by .*
      const raw = this.selector.replace(/\?/g, '.').replace(/\*/g, '.*');
      re = new RegExp(`^${raw}$`);
    }
    return re.test(s);
  }
  
} // END of class DatasetModifier


// CLASS Dataset
class Dataset {
  constructor(name) {
    this.name = name;
    this.comments = '';
    this.default_value = 0;
    this.scale_unit = '1';
    this.time_scale = 1;
    this.time_unit = CONFIGURATION.default_time_unit;
    this.method = 'nearest';
    this.periodic = false;
    this.array = false;
    this.black_box = false;
    this.outcome = false;
    this.parent_anchor = 0;
    // URL indicates that data must be read from external source.
    this.url = '';
    // Array `data` will contain modeler-defined values, starting at *dataset*
    // time step t = 1.
    this.data = [];
    // Array `vector` will contain data values on model time scale, starting at
    // *model* time step t = 0.
    this.vector = [];
    this.modifiers = {};
    // Selector to be used when model is run normally, i.e., no experiment.
    this.default_selector = '';
  }

  get type() {
    return 'Dataset';
  }

  get typeLetter() {
    return 'D';
  }

  get identifier() {
    return UI.nameToID(this.name);
  }
  
  get displayName() {
    return this.name;
  }
  
  get defaultAttribute() {
    // Dataset default attribute is '' to denote "no modifier"
    return '';
  }
  
  get attributes() {
    // NOTE: Modifiers are appended as additional lines of text.
    const a = {name: this.displayName};
    a.D = '\t' + (this.vector ? this.vector[MODEL.t] : this.default_value);
    for(let k in this.modifiers) if(this.modifiers.hasOwnProperty(k)) {
      const dm = this.modifiers[k];
      a.D += '\n\t' + dm.selector + '\t' + dm.expression.asAttribute;
    }
    return a;
  }
  
  get numberContext() {
    // Returns the string to be used to evaluate #
    // Like for nodes, this is the "tail number" of the dataset name.
    return UI.tailNumber(this.name);
  }
  
  get selectorList() {
    // Returns sorted list of selectors (those with wildcards last)
    const sl = [];
    for(let k in this.modifiers) if(this.modifiers.hasOwnProperty(k)) {
      sl.push(this.modifiers[k].selector);
    }
    return sl.sort(compareSelectors);
  }

  get plainSelectors() {
    // Return sorted list of selectors that do not contain wildcards.
    const sl = this.selectorList.slice();
    // NOTE: Wildcard selectors will always be at the end of the list
    for(let i = sl.length - 1; i >= 0; i--) {
      if(sl[i].indexOf('*') >= 0 || sl[i].indexOf('?') >= 0) sl.pop();
    }
    return sl;
  }
  
  get wildcardSelectors() {
    // Return sorted list of selectors that DO contain wildcards.
    const sl = this.selectorList;
    // NOTE: Wildcard selectors will always be at the end of the list.
    let i = sl.length - 1;
    while(i >= 0 && (sl[i].indexOf('*') >= 0 || sl[i].indexOf('?') >= 0)) {
      i--;
    }
    return sl.slice(i+1);
  }
  
  isWildcardSelector(s) {
    // Return TRUE if `s` contains * or ?
    // NOTE: For equations, the wildcard must be ??
    if(this.dataset === MODEL.equations_dataset) return s.indexOf('??') >= 0;
    return s.indexOf('*') >= 0 || s.indexOf('?') >= 0;
  }
  
  matchingModifiers(l) {
    // Return the list of modifiers of this dataset (in order: from most
    // to least specific) that match with 1 or more elements of `l`.
    const shared = [];
    for(const sel of l) {
      for(const s of this.selectorList) {
        const m = this.modifiers[UI.nameToID(s)];
        if(m.match(sel)) addDistinct(m, shared);
      }
    }
    return shared;
  }

  modifiersAreStatic(l) {
    // Return TRUE if expressions for all modifiers in `l` are static.
    // NOTE: `l` may be a list of modifiers or strings.
    for(let sel of l) {
      if(sel instanceof DatasetModifier) sel = sel.selector;
      if(this.modifiers.hasOwnProperty(sel) &&
         !this.modifiers[sel].expression.isStatic) return false;
    }
    return true;
  }
  
  get allModifiersAreStatic() {
    // Return TRUE if all modifier expressions are static.
    return this.modifiersAreStatic(Object.keys(this.modifiers));
  }
  
  get mayBeDynamic() {
    // Return TRUE if this dataset has time series data, or if some of
    // its modifier expressions are dynamic.
    return !this.array && (this.data.length > 1 ||
        (this.data.length > 0 && !this.periodic) ||
        !this.allModifiersAreStatic);
  }
  
  get inferPrefixableModifiers() {
    // Return a list of dataset modifiers with expressions that do not
    // reference any variable and hence could probably better be represented
    // by a prefixed dataset having the expression value as its default.
    const pml = [];
    if(this !== this.equations_dataset) {
      for(const sel of this.plainSelectors) {
        if(!MODEL.isDimensionSelector(sel)) {
          const
              m = this.modifiers[sel.toLowerCase()],
              x = m.expression;
          // Static expressions without variables can also be used
          // as dataset default value.
          if(x.isStatic && x.text.indexOf('[') < 0) pml.push(m);
        }
      }
    }
    return pml;
  }

  get timeStepDuration() {
    // Return duration of 1 time step on the time scale of this dataset.
    return this.time_scale * VM.time_unit_values[this.time_unit];
  }
  
  get defaultValue() {
    // Return default value *scaled to the model time step*.
    // NOTE: Scaling is only needed for the weighted sum method.
    if(this.method !== 'w-sum' || this.default_value >= VM.PLUS_INFINITY) {
      return this.default_value;
    }
    return this.default_value * MODEL.timeStepDuration / this.timeStepDuration;
  }

  changeScaleUnit(name) {
    let su = MODEL.addScaleUnit(name);
    if(su !== this.scale_unit) {
      this.scale_unit = su;
      MODEL.cleanUpScaleUnits();
    }
  }
  
  get dataString() {
    // NOTE: As of version 2.1.7, data is stored as semicolon-separated
    // B62-encoded numbers.
    return packVector(this.data);
  }
  
  get propertiesString() {
    // Return a string denoting the properties of this dataset.
    if(this.data.length === 0) return '';
    let time_prop;
    if(this.array) {
      time_prop = 'array';
    } else {
      time_prop = ['t=', VM.sig4Dig(this.time_scale), '&nbsp;',
        VM.time_unit_shorthand[this.time_unit], '&nbsp',
        DATASET_MANAGER.method_symbols[
            DATASET_MANAGER.methods.indexOf(this.method)]].join('');
    }
    // Circular arrow symbolizes "repeating".
    return '&nbsp;(' + time_prop + (this.periodic ? '&nbsp;\u21BB' : '') + ')'; 
  }
  
  unpackDataString(str, b62=true) {
    // Convert semicolon-separated data to a numeric array.
    // NOTE: When b62 is FALSE, data is not B62-encoded.
    this.data.length = 0;
    if(str) {
      if(b62) {
        this.data = unpackVector(str);
      } else {
        for(const n of str.split(';')) this.data.push(parseFloat(n));
      }
    }
    this.computeVector();
    this.computeStatistics();
  }

  computeVector() {
    // Convert data to a vector on the time scale of the model, i.e.,
    // 1 time step lasting one unit on the model time scale.
    
    // NOTE: A dataset can also be defined as an "array", which differs
    // from a time series in that the vector is filled with the data values
    // "as is" to permit accessing a specific value at index #. 
    if(this.array) {
      this.vector = this.data.slice();
      return;
    }
    // Like all vectors, vector[0] corresponds to initial value, and vector[1]
    // to the model setting "Optimize from step t=..."
    // NOTES:
    // (1) The first number of a datasets time series is ALWAYS assumed to
    //     correspond to t=1, whereas the simulation may be set to start later!
    // (2) Model run length includes 1 look-ahead period.
    VM.scaleDataToVector(this.data, this.vector, this.timeStepDuration,
        MODEL.timeStepDuration, MODEL.runLength, MODEL.start_period,
        this.defaultValue, this.periodic, this.method);
  }

  computeStatistics() {
    // Compute descriptive statistics for data (NOT vector!).
    if(this.data.length === 0) {
      this.min = VM.UNDEFINED;
      this.max = VM.UNDEFINED;
      this.mean = VM.UNDEFINED;
      this.standard_deviation = VM.UNDEFINED;
      return;
    }
    this.min = this.data[0];
    this.max = this.data[0];
    let sum = this.data[0];
    for(const v of this.data) {
      this.min = Math.min(this.min, v);
      this.max = Math.max(this.max, v);
      sum += v;
    }
    // NOTE: Avoid small differences due to numerical imprecision.
    if(this.max - this.min < VM.NEAR_ZERO) {
      this.max = this.min;
      this.mean = this.min;
      this.standard_deviation = 0;
    } else {
      this.mean = sum / this.data.length;
      let sumsq = 0;
      for(const v of this.data) {
        sumsq += Math.pow(v -  this.mean, 2);
      }
      this.standard_deviation = Math.sqrt(sumsq / this.data.length);
    }
  }
  
  get statisticsAsString() {
    // Return descriptive statistics in human-readable form.
    let s = 'N = ' + this.data.length;
    if(N > 0) {
      s += [', range = [', VM.sig4Dig(this.min), ', ', VM.sig4Dig(this.max),
          '], mean = ', VM.sig4Dig(this.mean), ', s.d. = ',
          VM.sig4Dig(this.standard_deviation)].join('');
    }
    return s;
  }
  
  attributeValue(a) {
    // Return the computed result for attribute `a`.
    // NOTE: Datasets have ONE attribute (their vector) denoted by the
    // dot ".". All other "attributes" should be modifier selectors,
    // and their value should be obtained using `attributeExpression(a)`.
    // The empty string denotes "use default", which may have been set
    // by the modeler, or may follow from the active combination of a
    // running experiment.
    if(a === '') {
      const x = this.activeModifierExpression;
      if(x instanceof Expression) {
        x.compute(0);
        // Ensure that for dynamic modifier expressions the vector is
        // fully computed.
        if(!x.isStatic) {
          const nt = MODEL.end_period - MODEL.start_period + 1;
          for(let t = 1; t <= nt; t++) x.result(t);
        }
        return x.vector;
      }
      // No modifier expression? Then return the dataset vector.
      return this.vector;
    }
    if(a === '.') return this.vector;
    // Still permit legacy use of [dataset|attr] as a way to "call" a
    // dataset modifier expression explicitly.
    if(a) {
      const x = this.attributeExpression(a);
      if(x) return x.result(MODEL.t);
    }
    // Fall-through: return the default value of this dataset.
    return this.defaultValue;
  }

  attributeExpression(a) {
    // Return the expression for selector `a` (also considering wildcard
    // modifiers), or NULL if no such selector exists.
    // NOTE: Selectors no longer are case-sensitive.
    if(a) {
      const mm = this.matchingModifiers([a]);
      if(mm.length > 0) return mm[0].expression;
    }
    return null;
  }

  get activeModifierExpression() { 
    if(MODEL.running_experiment) {
      // If an experiment is running, check if dataset modifiers match the
      // combination of selectors for the active run.
      const mm = this.matchingModifiers(MODEL.running_experiment.activeCombination);
      // If so, use the first match.
      if(mm.length > 0) return mm[0].expression;
    }
    if(this.default_selector) {
      // If no experiment (so "normal" run), use default selector if specified.
      const dm = this.modifiers[UI.nameToID(this.default_selector)];
      if(dm) return dm.expression;
      // Exception should never occur, but check anyway and log it.
      console.log('WARNING: Dataset "' + this.name +
          `" has no default selector "${this.default_selector}"`, this.modifiers);
    }
    // Fall-through: return the dataset vector.
    return this.vector;
  }
  
  addModifier(selector, node=null, ioc=null) {
    let s = selector;
    // First sanitize the selector.
    if(this === MODEL.equations_dataset) {
      // Equation identifiers cannot contain characters that have special
      // meaning in a variable identifier.
      s = s.replace(/[\*\|\[\]\{\}\@\#]/g, '');
      if(s !== selector) {
        UI.warn('Equation name cannot contain [, ], {, }, |, @, # or *');
        return null;
      }
      // Wildcard selectors must be exactly 2 consecutive question marks,
      // so reduce longer sequences (no warning).
      s = s.replace(/\?\?+/g, '??');
      if(s.split('??').length > 2) {
        UI.warn('Equation name can contain only 1 wildcard');
        return null;
      }
      // Reduce inner spaces to one, and trim outer spaces.
      s = s.replace(/\s+/g, ' ').trim();
      if(!s) {
        UI.warn(`Invalid equation name "${selector}"`);
        return null;
      }
      if(s.startsWith(':')) {
        // Methods must have no spaces directly after their leading colon,
        // and must not contain other colons.
        if(s.startsWith(': ')) s = ':' + s.substring(2);
        if(s.lastIndexOf(':') > 0) {
          UI.warn('Method name can contain only 1 colon');
          return null;
        }
      } else {
        // Prefix it when the IO context argument is defined.
        if(ioc) s = ioc.actualName(s);
      }
      // If equation already exists, return its modifier.
      const id = UI.nameToID(s);
      if(this.modifiers.hasOwnProperty(id)) return this.modifiers[id];
      // New equation identifier must not equal some entity ID.
      const obj = MODEL.objectByName(s);
      if(obj) {
        // NOTE: Also pass selector, or warning will display dataset name.
        UI.warningEntityExists(obj);
        return null;
      }
    } else {
      // Standard dataset modifier selectors are much more restricted.
      s = MODEL.validSelector(s);
      if(!s) return;
    }
    // Then add a dataset modifier to this dataset.
    const id = UI.nameToID(s);
    if(!this.modifiers.hasOwnProperty(id)) {
      this.modifiers[id] = new DatasetModifier(this, s);
    }
    // Finally, initialize it when the XML node argument is defined.
    if(node) this.modifiers[id].initFromXML(node);
    return this.modifiers[id];
  }

  get asXML() {
    let n = this.name,
        cmnts = xmlEncoded(this.comments),
        p = (this.periodic ? ' periodic="1"' : '');
    if(this.array) {
      p += ' array="1"';
    } else if(this.outcome) {
      p += ' outcome="1"';
    }
    if(this.black_box) p += ' black-box="1"';
    const ml = [],
          sl = [];
    for(let m in this.modifiers) if(this.modifiers.hasOwnProperty(m)) {
      sl.push(m);
    }
    sl.sort(compareSelectors);
    for(const sel of sl) ml.push(this.modifiers[sel].asXML);
    // NOTE: "black-boxed" datasets are stored anonymously without comments.
    const id = UI.nameToID(n);
    if(MODEL.black_box_entities.hasOwnProperty(id)) {
      n = MODEL.black_box_entities[id];
      cmnts = '';
    }
    const
        data = xmlEncoded(this.dataString),
        xml = ['<dataset', p, '>',
            '<name>', xmlEncoded(n),
            '</name><unit>', xmlEncoded(this.scale_unit),
            '</unit><time-scale>', this.time_scale,
            '</time-scale><time-unit>', this.time_unit,
            '</time-unit><method>', this.method,
            '</method>'];
    // NOTE: Omit empty fields to reduce model file size.
    if(cmnts) xml.push('<notes>', cmnts, '</notes>');
    if(this.default_value) xml.push('<default>',
        this.default_value, '</default>');
    if(this.url) xml.push('<url>', xmlEncoded(this.url), '</url>');
    if(data) xml.push('<data b62="1">', data, '</data>');
    if(ml.length) xml.push('<modifiers>', ml.join(''), '</modifiers>');
    if(this.default_selector) xml.push('<default-selector>',
        xmlEncoded(this.default_selector), '</default-selector>');
    xml.push('</dataset>');
    return xml.join('');
  }

  initFromXML(node) {
    this.comments = xmlDecoded(nodeContentByTag(node, 'notes'));
    this.default_value = safeStrToFloat(nodeContentByTag(node, 'default'), 0);
    this.scale_unit = xmlDecoded(nodeContentByTag(node, 'unit')) || '1';
    this.time_scale = safeStrToFloat(nodeContentByTag(node, 'time-scale'), 1);
    this.time_unit = nodeContentByTag(node, 'time-unit') ||
        CONFIGURATION.default_time_unit;
    this.method = nodeContentByTag(node, 'method') || 'nearest';
    this.periodic = nodeParameterValue(node, 'periodic') === '1';
    this.array = nodeParameterValue(node, 'array') === '1';
    this.black_box = nodeParameterValue(node, 'black-box') === '1';
    // NOTE: Array-type datasets are by definition input => not an outcome.
    if(!this.array) this.outcome = nodeParameterValue(node, 'outcome') === '1';
    this.url = xmlDecoded(nodeContentByTag(node, 'url'));
    if(this.url) {
      FILE_MANAGER.getRemoteData(this, this.url);
    } else {
      let data = '',
          b62 = false;
      const cn = childNodeByTag(node, 'data');
      if(cn) {
        data = nodeContent(cn);
        b62 = (nodeParameterValue(cn, 'b62') === '1');
      }
      this.unpackDataString(xmlDecoded(data), b62);
    }
    const n = childNodeByTag(node, 'modifiers');
    if(n) {
      for(const c of n.childNodes) if(c.nodeName === 'modifier') {
        this.addModifier(xmlDecoded(nodeContentByTag(c, 'selector')), c);
      }
    }
    const ds = xmlDecoded(nodeContentByTag(node, 'default-selector'));
    if(ds && !this.modifiers[UI.nameToID(ds)]) {
      UI.warn(`Dataset <tt>${this.name}</tt> has no selector <tt>${ds}</tt>`);
    } else {
      this.default_selector = ds;      
    }
  }
  
  rename(name, notify=true) {
    // Change the name of this dataset.
    // When `notify` is FALSE, notifications are suppressed while the
    // number of affected datasets and expressions are counted.
    // NOTE: Prevent renaming the equations dataset (just in case).
    if(this === MODEL.equations_dataset) return;
    name = UI.cleanName(name);
    if(!UI.validName(name)) {
      UI.warningInvalidName(name);
      return null;
    }
    const
        old_name = this.name,
        old_id = this.identifier,
        new_id = UI.nameToID(name),
        obj = MODEL.namedObjectByID(new_id);
    if(obj && obj !== this) {
      UI.warningEntityExists(obj);
      return null;
    }
    this.name = name;
    MODEL.datasets[new_id] = this;
    if(old_id !== new_id) delete MODEL.datasets[old_id];
    MODEL.replaceEntityInExpressions(old_name, name, notify);
    return MODEL.datasets[new_id];
  }
  
  resetExpressions() {
    // Recalculate vector to adjust to model time scale and run length.
    this.computeVector();
    // Reset all modifier expressions.
    for(let m in this.modifiers) if(this.modifiers.hasOwnProperty(m)) {
      // NOTE: "empty" expressions for modifiers default to dataset default.
      this.modifiers[m].expression.reset(this.defaultValue);
    }
  }

  compileExpressions() {
    // Recompile all modifier expressions.
    for(let m in this.modifiers) if(this.modifiers.hasOwnProperty(m)) {
      this.modifiers[m].expression.compile();
    }
  }

  differences(ds) {
    // Return "dictionary" of differences, or NULL if none.
    const d = differences(this, ds, UI.MC.DATASET_PROPS);
    // Check for differences in data.
    if(this.dataString !== ds.dataString) {
      d.data = {A: this.statisticsAsString, B: ds.statisticsAsString};
    }
    // Check for differences in modifiers.
    const mdiff = {};
    for(let m in this.modifiers) if(this.modifiers.hasOwnProperty(m)) {
      const
          ms = this.modifiers[m].selector,
          mx = this.modifiers[m].expression.text;
      if(m in ds.modifiers) {
        const dsmx = ds.modifiers[m].expression.text;
        if(mx !== dsmx) mdiff[m] = [UI.MC.MODIFIED, ms, {A: mx, B: dsmx}];
      } else {
        mdiff[m] = [UI.MC.ADDED, ms, mx];
      }
    }
    for(let m in ds.modifiers) if(ds.modifiers.hasOwnProperty(m)) {
      if(!(m in this.modifiers)) {
        const dsm = ds.modifiers[m];
        mdiff[m] = [UI.MC.DELETED, dsm.selector, dsm.expression.text];
      }
    }
    // Only add modifiers property if differences were detected.
    if(Object.keys(mdiff).length > 0) d.modifiers = mdiff; 
    if(Object.keys(d).length > 0) return d;
    return null;
  }

} // END of class Dataset


// CLASS ChartVariable defines properties of chart time series.
class ChartVariable {
  constructor(c) {
    this.chart = c;
    this.vector = [];
    this.N = 0;
    this.sum = 0;
    this.mean = 0;
    this.variance = 0;
    this.minimum = 0;
    this.maximum = 0;
    this.non_zero_tally = 0;
    this.exceptions = 0;
    this.bin_tallies = [];
    // The actual wildcard index is set for each variable that is added
    // during this "expansion".
    this.wildcard_index = false;
  }
  
  setProperties(obj, attr, stck, clr, sf=1, abs=false, lw=1, vis=true, sort='not') {
    // Sets the defining properties for this chart variable.
    this.object = obj;
    this.attribute = attr;
    this.stacked = stck;
    this.color = clr;
    this.scale_factor = sf;
    this.absolute = abs;
    this.line_width = lw;
    this.visible = vis;
    this.sorted = sort;
  }
  
  get type() {
    // NOTE: Charts are not entities, but the dialogs may inquire their type
    // for sorting and presentation (e.g., to determine icon name).
    return 'Chart';
  }
  
  get displayName() {
    // Returns the display name for this variable. This is the name of
    // the Linny-R entity and its attribute, followed by its scale factor
    // unless it equals 1 (no scaling).
    const
        bar = (this.absolute ? '\u2503' : ''),
        sf = (this.scale_factor === 1 ? '' :
            // NOTE: Pass tiny = TRUE to permit very small scaling factors.
            ` (x${VM.sig4Dig(this.scale_factor, true)})`);
    // Display name of equation is just the equations dataset selector. 
    if(this.object instanceof DatasetModifier) {
      let eqn = this.object.selector;
      // If for this variable the `wildcard_index` property has been set,
      // this indicates that it is a Wildcard selector or a method, and
      // that the specified result vector should be used.
      if(this.wildcard_index !== false) {
        eqn = eqn.replace('??', this.wildcard_index);
      } else if(eqn.startsWith(':')) {
        // For methods, use "entity name or prefix: method" as variable
        // name, so first get the method object prefix, expand it if
        // it identifies a specific model entity, and then append the
        // method name (leading colon replaced by the prefixer ": ").
        eqn = this.chart.prefix + UI.PREFIXER + eqn.substring(1);
      }
      return bar + eqn + bar + sf;
    }
    // NOTE: Same holds for "dummy variables" added for wildcard
    // dataset selectors.
    if(this.object === MODEL.equations_dataset) {
      let eqn = this.attribute;
      if(this.wildcard_index !== false) {
        eqn = eqn.replace('??', this.wildcard_index);
      }
      return bar + eqn + bar + sf;
    }
    // NOTE: Do not display the vertical bar if no attribute is specified.
    if(!this.attribute) {
      return bar + this.object.displayName + bar + sf;
    }
    return bar + this.object.displayName + '|' + this.attribute + bar + sf;
  }
  
  get asXML() {
    // NOTE: A "black-boxed" model can comprise charts showing "anonymous"
    // entities, so the IDs of these entities must then be changed.
    let id = this.object.identifier;
    if(MODEL.black_box_entities.hasOwnProperty(id)) {
      id = UI.nameToID(MODEL.black_box_entities[id]);
    }
    const xml = ['<chart-variable',
        (this.stacked ? ' stacked="1"' : ''),
        (this.absolute ? ' absolute="1"' : ''),
        (this.visible ? ' visible="1"' : ''),
        (this.wildcard_index !== false ?
            ` wildcard-index="${this.wildcard_index}"` : ''),
        ` sorted="${this.sorted}"`,
        '><object-id>', xmlEncoded(id),
        '</object-id><attribute>', xmlEncoded(this.attribute),
        '</attribute><color>', this.color,
        '</color><scale-factor>', VM.sig4Dig(this.scale_factor, true),
        '</scale-factor><line-width>', VM.sig4Dig(this.line_width),
        '</line-width></chart-variable>'].join('');
    return xml;
  }
  
  get lowestValueInVector() {
    // Return the computed statistical minimum OR vector[0] (if valid & lower).
    let v = this.minimum;
    if(this.vector.length > 0) v = this.vector[0];
    if(v < VM.MINUS_INFINITY || v > VM.PLUS_INFINITY || v > this.minimum) {
      return this.minimum;
    }
    return v;
  }

  get highestValueInVector() {
    // Return the computed statistical maximum OR vector[0] (if valid & higher).
    let v = this.maximum;
    if(this.vector.length > 0) v = this.vector[0];
    if(v < VM.MINUS_INFINITY || v > VM.PLUS_INFINITY || v < this.maximum) {
      return this.maximum;
    }
    return v;
  }

  initFromXML(node) {
    let id = xmlDecoded(nodeContentByTag(node, 'object-id'));
    // NOTE: Automatic conversion of former top cluster name.
    if(id === UI.FORMER_TOP_CLUSTER_NAME.toLowerCase()) {
      id = UI.nameToID(UI.TOP_CLUSTER_NAME);
    }
    if(IO_CONTEXT) {
      // NOTE: actualName also works for entity IDs.
      id = UI.nameToID(IO_CONTEXT.actualName(id));
    }
    const obj = MODEL.objectByID(id);
    if(!obj) {
      UI.warn(`No chart variable entity with ID "${id}"`);
      return false;
    }
    // For wildcard variables, a subset of wildcard indices may be specified.
    const wci = nodeParameterValue(node, 'wildcard-index');
    this.wildcard_index = (wci ? parseInt(wci) : false);
    this.setProperties(
        obj,
        xmlDecoded(nodeContentByTag(node, 'attribute')),
        nodeParameterValue(node, 'stacked') === '1',
        nodeContentByTag(node, 'color'),
        safeStrToFloat(nodeContentByTag(node, 'scale-factor')),
        nodeParameterValue(node, 'absolute') === '1',
        safeStrToFloat(nodeContentByTag(node, 'line-width')),
        nodeParameterValue(node, 'visible') === '1',
        nodeParameterValue(node, 'sorted') || 'not');
    return true;
  }

  computeVector() {
    // Compute vector for this variable (using run results if specified).
    let xrun = null,
        rr = null,
        ri = this.chart.run_index;
    if(ri >= 0) {
      const
          x = EXPERIMENT_MANAGER.selected_experiment,
          vn = this.displayName,
          rri = x.resultIndex(vn);
      if(ri < x.runs.length && rri >= 0) {
        xrun = x.runs[ri];
        rr = xrun.results[rri];
        this.vector.length = 0;
      }
    }
    // Compute vector and statistics only if vector is still empty.
    if(this.vector.length > 0) return;
    // NOTE: Expression vectors start at t = 0 with initial values that
    // should not be included in statistics.
    let v,
        av = null,
        t_end;
    this.sum = 0;
    this.variance = 0;
    this.minimum = VM.PLUS_INFINITY;
    this.maximum = VM.MINUS_INFINITY;
    this.non_zero_tally = 0;
    this.exceptions = 0;
    if(rr) {
      // Use run results (time scaled) as "actual vector" `av` for this
      // variable.
      const tsteps = Math.ceil(this.chart.time_horizon / this.chart.time_scale);
      av = [];
      // NOTE: `scaleDataToVector` expects "pure" data, so slice off v[0].
      VM.scaleDataToVector(rr.vector.slice(1), av, xrun.time_step_duration,
          this.chart.time_scale, tsteps, 1);
      t_end = tsteps;
    } else {
      // Get the variable's own value (number, vector or expression).
      if(this.object instanceof Dataset) {
        if(this.attribute) {
          av = this.object.attributeExpression(this.attribute);
        } else {
          // Special case: Variables that depict a dataset with no explicit
          // modifier selector must recompute the vector using the current
          // experiment run combination or the default selector.
          av = this.object.activeModifierExpression;
        }
      } else if(this.object instanceof DatasetModifier) {
        av = this.object.expression;
      } else {
        av = this.object.attributeValue(this.attribute);
        if(av === null) av = this.object.attributeExpression(this.attribute);
      }
      t_end = MODEL.end_period - MODEL.start_period + 1;
    }
    // NOTE: When a chart combines run results with dataset vectors, the
    // latter may be longer than the # of time steps displayed in the chart.
    t_end = Math.min(t_end, this.chart.total_time_steps);
    this.N = t_end;
    for(let t = 0; t <= t_end; t++) {
      // Get the result, store it, and incorporate it in statistics.
      if(!av) {
        // Undefined attribute => zero (no error).
        v = 0;
      } else if(Array.isArray(av)) {
        // Attribute value is a vector.
        // NOTE: This vector may be shorter than t; then use 0.
        v = (t < av.length ? av[t] : 0);
      } else if(av instanceof Expression) {
        // Attribute value is an expression. If this chart variable has
        // its wildcard vector index set, evaluate the expression with
        // this index as context number. Likewise, set the method object
        // prefix.
        av.method_object_prefix = this.chart.prefix;
        v = av.result(t, this.wildcard_index);
      } else {
        // Attribute value must be a number.
        v = av;
      }
      // Map undefined values and all errors to 0.
      if(v < VM.MINUS_INFINITY || v > VM.PLUS_INFINITY) {
        // Do not include values for t = 0 in statistics.
        if(t > 0) this.exceptions++;
        v = 0;
      }
      // Scale the value unless run result (these are already scaled!).
      if(!rr) {
        if(this.absolute) v = Math.abs(v);
        v *= this.scale_factor;
      }
      this.vector.push(v);
      // Do not include values for t = 0 in statistics.
      if(t > 0) {
        if(Math.abs(v) > VM.NEAR_ZERO) {
          this.sum += v;
          this.non_zero_tally++;
        }
        this.minimum = Math.min(this.minimum, v);
        this.maximum = Math.max(this.maximum, v);
      }
    }
    if(this.maximum - this.minimum < VM.NEAR_ZERO) {
      // Ignore minute differences.
      this.maximum = this.minimum;
      this.mean = this.minimum;
      this.variance = 0;
    } else {
      // Compute the mean.
      this.mean = this.sum / t_end;
      // Compute the variance for t=1, ..., N.
      let sumsq = 0;
      for(let t = 1; t <= t_end; t++) {
        v = this.vector[t];
        // Here, too, ignore exceptional values, and use 0 instead.
        if(v < VM.MINUS_INFINITY || v > VM.PLUS_INFINITY) v = 0;
        sumsq += Math.pow(v - this.mean, 2);
      }
      this.variance = sumsq / t_end;
    }
  }
  
  tallyVector() {
    // Compute the histogram bin tallies for this chart variable.
    // Use local constants to save some time within the FOR loop.
    const
        bins = this.chart.bins,
        bin1 = this.chart.first_bin,
        binsize = this.chart.bin_interval,
        l = this.vector.length;
    this.bin_tallies = Array(bins).fill(0);
    for(let i = 1; i < l; i++) {
      let v = this.vector[i];
      // NOTE: Ignore exceptional values in histogram.
      if(v >= VM.MINUS_INFINITY && v <= VM.PLUS_INFINITY) {
        const bi = Math.min(bins,
          Math.floor((v - bin1 - VM.NEAR_ZERO) / binsize + 1));
        this.bin_tallies[bi]++;
      }
    }
  }

  setLinePath(x0, y0, dx, dy) {
    // Set SVG path unless already set or line not visible.
    if(this.line_path.length === 0 && this.visible) {
      // Vector may have to be sorted in some way.
      const vect = this.vector.slice();
      if(this.sorted === 'asc') {
        // Sort values in ascending order.
        vect.sort();
      } else if(this.sorted === 'desc') {
        // Sort values in descending order.
        vect.sort((a, b) => { return b - a; });
      } else if(this.chart.time_step_numbers) {
        // Fill vector with its values sorted by time step.
        const tsn = this.chart.time_step_numbers;
        for(let i = 0; i < this.vector.length; i++) {
          vect[i] = this.vector[tsn[i]];
        }
      }
      //
      let y = y0 - this.vector[0] * dy;
      const
          path = ['M', x0, ',', y],
          l = vect.length;
      // NOTE: Now we can use relative line coordinates
      for(let t = 1; t < l; t++) {
        const new_y = y0 - vect[t] * dy;
        path.push(`v${new_y - y}h${dx}`);
        y = new_y;
      }
      this.line_path = path.join('');
    }
  }

  setBars(x0, y0, dx, dy, barw) {
    // Set SVG path for histogram unless variable not visible.
    if(this.visible) {
      const path = [];
      let x = x0;
      for(const tally of this.bin_tallies) {
        const barh = tally * dy;
        path.push('M', x, ',', y0, 'l0,-', barh, 'l', barw, ',0l0,', barh, 'Z');
        x += dx;
      }
      this.line_path = path.join('');
    }
  }

  differences(c) {
    // Return "dictionary" of differences, or NULL if none
    const d = differences(this, c, UI.MC.CHART_VAR_PROPS);
    if(Object.keys(d).length > 0) return d;
    return null;
  }
  
} // END of class ChartVariable


// CLASS Chart
class Chart {
  constructor(n) {
    this.title = n;
    this.comments = '';
    this.reset();
  }
  
  reset() {
    this.histogram = false;
    this.bins = 20;
    this.first_bin = 0;
    this.bin_interval = 0;
    this.value_range = 0;
    this.show_title = true;
    this.legend_position = 'none';
    this.preferred_prefix = '';
    this.variables = [];
    // SVG string to display the chart
    this.svg = '';
    // Properties of rectangular chart area 
    this.chart_rect = {top: 0, left: 0, height: 0, width: 0};
  }
  
  get type() {
    return 'Chart';
  }
  
  get displayName() {
    // Charts are identified by their title. 
    return this.title;
  }

  get prefix() {
    // The prefix is used to further specify method variables.
    if(this.preferred_prefix) return this.preferred_prefix;
    const parts = this.title.split(UI.PREFIXER);
    parts.pop();
    // Now `parts` is empty when the title contains no colon+space.
    return parts.join(UI.PREFIXER);
  }
  
  get possiblePrefixes() {
    // Return list of prefixes that are eligible for all method variables.
    let pp = null;
    for(const v of this.variables) {
      if(v.object instanceof DatasetModifier && v.object.selector.startsWith(':')) {
        if(pp) {
          pp = intersection(pp, Object.keys(v.object.expression.eligible_prefixes));
        } else {
          pp = Object.keys(v.object.expression.eligible_prefixes);
        }
      }
    }
    if(pp) pp.sort();
    // Always return a list.
    return pp || [];
  }
  
  get asXML() {
    let xml = '';
    for(const v of this.variables) xml += v.asXML;
    xml = ['<chart', (this.histogram ? ' histogram="1"' : ''),
        (this.show_title ? ' show-title="1"' : ''),
        '><title>', xmlEncoded(this.title),
        '</title><notes>', xmlEncoded(this.comments),
        '</notes><bins>', this.bins,
        '</bins><legend-position>', this.legend_position,
        '</legend-position><variables>', xml,
        '</variables></chart>'].join('');
    return xml;
  }

  initFromXML(node) {
    this.comments = xmlDecoded(nodeContentByTag(node, 'notes'));
    this.histogram = nodeParameterValue(node, 'histogram') === '1';
    this.show_title = nodeParameterValue(node, 'show-title') === '1';
    // If not specified, set # bins to 20
    this.bins = safeStrToInt(nodeContentByTag(node, 'bins'), 20);
    this.legend_position = nodeContentByTag(node, 'legend-position');
    this.variables.length = 0;
    const n = childNodeByTag(node, 'variables');
    if(n) {
      for(const c of n.childNodes) if(c.nodeName === 'chart-variable') {
        const v = new ChartVariable(this);
        // NOTE: Variable may refer to deleted entity => do not add.
        if(v.initFromXML(c)) this.variables.push(v);
      }
    }
  }
  
  variableIndexByName(n) {
    for(let index = 0; index < this.variables.length; index++) {
      if(this.variables[index].displayName === n) return index;
    }
    return -1;
  }
    
  get nextAvailableDefaultColor() {
    const cl = [];
    for(const v of this.variables) cl.push(v.color);
    for(const c of UI.chart_colors) if(cl.indexOf(c) < 0) return c;
    return '#c00000';
  }

  addVariable(n, a='') {
    // Add variable [entity name `n`|attribute `a`] to the chart unless
    // it is already in the variable list.
    let dn = n + UI.OA_SEPARATOR + a;
    // Adapt display name for special cases.
    if(n === UI.EQUATIONS_DATASET_NAME) {
      // For equations only the attribute (modifier selector).
      dn = a;
      n = a;
    } else if(!a) {
      // If no attribute specified (=> dataset) only the entity name.
      dn = n;
    }
    let vi = this.variableIndexByName(dn);
    if(vi >= 0) return vi;
    // Check whether name refers to a Linny-R entity defined by the model.
    let obj = MODEL.objectByName(n);
    if(obj === null) {
      UI.warn(`Unknown entity "${n}"`);
      return null;
    }
    const eq = obj instanceof DatasetModifier;
    // No equation and no attribute specified? Then assume default.
    if(!eq && a === '') a = obj.defaultAttribute;
    if(eq && n.indexOf('??') >= 0) {
      // Special case: for wildcard equations, prompt the modeler which
      // wildcard possibilities to add UNLESS this is an untitled "dummy" chart
      // used to report outcomes.
      if(this.title) {
        CHART_MANAGER.promptForWildcardIndices(this, obj);
      } else {
        this.addWildcardVariables(obj,
            Object.keys(obj.expression.wildcard_vectors));
      }
    } else {
      const v = new ChartVariable(this);
      v.setProperties(obj, a, false, this.nextAvailableDefaultColor);
      this.variables.push(v);
    }
    return this.variables.length - 1;
  }
  
  addWildcardVariables(dsm, indices) {
    // For dataset modifier `dsm`, add dummy variables for those vectors
    // in the wildcard vector set of the expression that are indicated
    // by the list `indices`.
    const dn = dsm.displayName;
    for(const index of indices) {
      const v = new ChartVariable(this);
      v.setProperties(dsm,  dn, false, this.nextAvailableDefaultColor);
      v.wildcard_index = parseInt(index);
      this.variables.push(v);
    }    
  }

  addSVG(lines) {
    // Append a string or an array of strings to the SVG.
    this.svg += (lines instanceof Array ? lines.join('') : lines);
  }
  
  addText(x, y, text, fill='black', fsize=16, attr = '') {
    // Append a text element to the SVG.
    this.addSVG(['<text x="', x, '" y="', y,
        '" font-size="', fsize, 'px" fill="', fill, '" ', attr,
        ' dominant-baseline="middle" stroke="none" pointer-events="none">',
        text, '</text>']);    
  }

  inferTimeScale() {
    // Time scale follows either from selected experiment runs or from model.
    const
        selx = EXPERIMENT_MANAGER.selected_experiment,
        runs = EXPERIMENT_MANAGER.selectedRuns(this);
    if(runs.length > 0) {
      // NOTE: Runs may have different time scales; the longest TIME
      // (i.e., time steps * delta-t) determines the number of time steps to
      // display, while the shortest delta-t detemines the time resolution.
      this.time_horizon = 0;
      this.time_scale = 1000000;
      for(const run of runs) {
        const r = selx.runs[run];
        this.time_scale = Math.min(this.time_scale, r.time_step_duration);
        this.time_horizon = Math.max(this.time_horizon,
            r.time_step_duration * r.time_steps);
      }
      // Experiment runs always start at t = 1.
      this.total_time_steps = Math.ceil(this.time_horizon / this.time_scale);
    } else {
      // No runs? then use the model's time scale and simulation period
      this.time_scale = MODEL.timeStepDuration;
      this.total_time_steps = MODEL.end_period - MODEL.start_period + 1;
      this.time_horizon = this.total_time_steps * this.time_scale;
    }
  }
  
  sortLeadTimeVector() {
    // Set the time vector to NULL if no "lead-sort" varianles are
    // visible, or to a list of N+1 time steps (with N the run length)
    // sorted on the values of the lead-sorted variables in their order
    // of appearance in the chart.
    this.time_step_numbers = null;
    const
        lsv = [],
        lss = [];
    for(const cv of this.variables) {
      if(cv.visible && cv.sorted.endsWith('-lead')) {
        lsv.push(cv.vector);
        lss.push(cv.sorted.startsWith('asc') ? 1 : -1);
      }
    }
    // If no "lead sort" variables, then no need to set the time steps.
    if(lsv.length === 0) return;
    this.time_step_numbers = Array.apply(null,
        {length: this.total_time_steps + 1}).map(Number.call, Number);
    this.time_step_numbers.sort((a, b) => {
        let c = 0;
        for(let i = 0; c === 0 && i < lsv.length; i++) {
          // Multiply by `lss` (lead sort sign), which will be +1 for
          // ascending order and -1 for descending order.
          c = (lsv[i][a] - lsv[i][b]) * lss[i];
        }
        return c;
      });
  }
  
  resetVectors() {
    // Empty the vector arrays of all variables.
    for(const v of this.variables) {
      v.vector.length = 0;
      v.line_path = '';
    }
    // NOTE: Set the number of time steps to the simulation period, as this
    // property is used by chart variables to adjust their vector length.
    this.inferTimeScale();
  }
  
  labelStep(range, max_labels, min_step) {
    // Return the first "clean" step size (decimal number starting
    // with 1, 2 or 5) that divides `range` in `max_labels` intervals.
    // NOTE: `min_step` may be small, but must me non-negative.
    let min = range / max_labels,
        minmul = Math.max(VM.NEAR_ZERO, min_step),
        mul = Math.max(minmul, Math.pow(10, Math.floor(Math.log10(min))));
    // Prevent infinite loop.
    while(mul < VM.PLUS_INFINITY) {
      for(const d of [1, 2, 5]) {
        const step = mul * d;
        if(min < step) {
          // Return the first "clean" step size.
          return step;
        }
      }
      mul *= 10;
    }
    // Fall-through (should never be reached).
    return VM.PLUS_INFINITY;
  }
  
  timeScaleAsString(s) {
    // Return number `s` (in hours) as string with most appropriate time unit.
    if(s < 1/60) return VM.sig2Dig(s * 3600) + 's';
    if(s < 1) return VM.sig2Dig(s * 60) + 'm';
    if(s < 24) return VM.sig2Dig(s) + 'h';
    if(s < 168) return VM.sig2Dig(s / 24) + 'd';
    if(s < 8760) return VM.sig2Dig(s / 168) + 'w';
    return VM.sig2Dig(s / 8760) + 'y';
  }
  
  draw(display=true) {
    // NOTE: The SVG drawing area is fixed to be 500 pixels high, so that
    // when saved as a file, it will (at 300 dpi) be about 2 inches high.
    // Its width will equal its hight times the W/H-ratio of the chart
    // container, stretched by factor `sf`.
    const
        height = CHART_MANAGER.svg_height,
        scale = CHART_MANAGER.container_height / height,
        width = (scale ? CHART_MANAGER.container_width / scale : 1),
        // Assume a fixed font character size of 16 pixels (fitting 30 lines).
        font_height = 16,
        font_width = font_height * 0.6,
        // Preserve 8 pixels margin on all sides.
        margin = 8,
        pats = ['dash', 'dot', 'dash_dot', 'long_dash', 'longer_dash',
            'short_dash', 'shorter_dash', 'long_dash_dot', 'even_dash',
            'dot_dot'];
    // Initialize the SVG with the computed dimensions.
    this.svg = ['<svg version="1.1" xmlns="http://www.w3.org/2000/svg"',
        ' xmlns:xlink="http://www.w3.org/1999/xlink" xml:space="preserve"',
        ' font-family="Arial" font-size="', font_height,
        'px" text-anchor="middle" alignment-baseline="middle"',
        ' height="', CHART_MANAGER.container_height,
        '" width="', CHART_MANAGER.container_width,
        '" viewBox="0 0 ', width, ' ', height, '">',
        //  style="overflow: hidden; position: relative;"
        '<defs>', CHART_MANAGER.fill_patterns, '</defs>'].join('');
    // NOTE: `rl`, `rt`, `rw` and `rh` define the XY-rectangle for plotting.
    let
        // Assume max. 7 digits for Y-scale numbers.
        rl = 7 * font_width + margin,
        // Assume no legend or title.
        rt = margin,
        // Reserve 25px extra margin on the right to accomodate larger t-values.
        rw = width - rl - 25,
        // Make vertical space for x-axis labels.
        rh = height - rt - margin - font_height,
        // Keep track of the number of visible chart variables.
        vv = 0;
    // Reserve vertical space for title (if shown).
    if(this.show_title) {
      // NOTE: Use title font size 120% of default.
      const th = 1.2 * font_height + margin;
      rt += th;
      rh -= th;
    }
    // If run result statistics are plotted, reserve vertical space for
    // bar chart run dimension selectors.
    const
        selx = EXPERIMENT_MANAGER.selected_experiment,
        stat_bars = CHART_MANAGER.runs_stat;
    if(stat_bars) {
      if(selx) {
        // First plot dimension will replace run numbers, so only reserve
        // space for additional plot dimensions.
        const dh = 1.2 * font_height * (selx.plot_dimensions.length - 1);
        if(dh > 0) rh -= dh;
      }
    }
    if(this.variables.length > 0) {
      // Count visible variables and estimate total width of their names
      // as well as the width of the longest name.
      let w,
          vnw = [],
          lvnw = 0,
          tvnw = 0;
      for(const v of this.variables) {
        // Always calculate and push width (to keep arrays of equal length).
        w = UI.textSize(v.displayName, font_height).width;
        vnw.push(w);
        if(v.visible) {
          vv++;
          tvnw += w;
          lvnw = Math.max(lvnw, w);
        } 
      }
      if(vv) {
        const sym_size = Math.max(5, font_height);
        let leg_height = 0,
            leg_width = 0,
            leg_top,
            leg_left;
        if(this.legend_position === 'right') {
          // Use line spacing 1.5
          leg_height = vv * 1.5 * font_height;
          // Add more space (15 instead of 4) to compensate for the error in
          // text width calculation (see note where textWidth is defined).
          leg_width = lvnw + sym_size + 15;
          rw -= leg_width - margin;
          leg_left = rl + rw + margin;
          leg_top = rt + 0.5*(rh - leg_height);
        } else if(this.legend_position != 'none') {
          leg_height = font_height;
          leg_width = tvnw + vv * 2 * sym_size;
          leg_left = rl + 0.5*(rw - leg_width);
          rh -= leg_height + margin;
          if(this.legend_position === 'top') {
            leg_top = rt - margin;
            rt += leg_height + margin;
          } else {
            // NOTE: Font height relates to the numbers along the X-axis.
            leg_top = rt + rh + 1.5*margin + font_height;
          }
        }
        if(this.legend_position != 'none') {
          // Draw the legend items.
          let x = leg_left,
              // Vertical text align is middle, so add half a font height.
              y = leg_top + font_height;
          for(let i = 0; i < this.variables.length; i++) {
            const v = this.variables[i];
            if(v.visible) {
              // Add arrow indicating sort direction to name if applicable.
              const vn = v.displayName + CHART_MANAGER.sort_arrows[v.sorted];
              if(v.stacked || this.histogram || stat_bars) {
                this.addSVG(['<rect x="', x, '" y="', y - sym_size + 2,
                    '" width="', sym_size, '" height="', sym_size,
                    '" fill="', v.color,'" fill-opacity="0.35" stroke="',
                    v.color, '" stroke-width="', 0.5 * v.line_width,
                    '" pointer-events="none"></rect>']);
              } else {
                this.addSVG(['<rect x="', x,
                    '" y="', y - 0.5*sym_size - v.line_width + 2,
                    '" width="', sym_size, '" height="', v.line_width * 2,
                    '" fill="', v.color,
                    '" stroke="none" pointer-events="none"></rect>']);
              }
              this.addText(x + sym_size + 4, y - 0.3* font_height, vn, 'black',
                  font_height, 'text-anchor="start"');
              if(this.legend_position === 'right') {
                y += 1.5* font_height;
              } else {
                x += 2 * sym_size + vnw[i];
              }
            } 
          }
        }
      }
    }

    // NOTE: chart may display experiment run results, rather than MODEL results
    let runnrs = '';
    const runs = EXPERIMENT_MANAGER.selectedRuns(this);
    if(runs.length > 0) {
      const stat = (stat_bars ?
          EXPERIMENT_MANAGER.selectedStatisticName + ' for ': ''); 
      runnrs = [' (', selx.title, ': ', stat, 'run',
          (runs.length > 1 ? 's' : ''), ' #', runs.join(', '), ')'].join('');
    }
    // Let Chart Manager display experiment title if selected runs are shown
    CHART_MANAGER.updateExperimentInfo();

    // By default, the horizontal axis covers the simulation time period,
    // but experiment run result vectors may be longer or shorter
    this.inferTimeScale();
    let first_step = MODEL.start_period,
        last_step = MODEL.end_period,
        time_steps = this.total_time_steps;
    if(runs.length > 0) {
      // Adjust time step settings: run results always start at t=1.
      first_step = 1;
      last_step = time_steps;
    }
    
    // Calculate the range for the Y-axis (over all visible chart variables).
    // NOTE: Let scale start at 0 unless minimum < 0 EXCEPT for a histogram.
    let minv = (this.histogram ? VM.PLUS_INFINITY : 0),
        maxv = VM.MINUS_INFINITY;
    const bar_values = {};
    for(let i = 0; i < this.variables.length; i++) {
      const v = this.variables[i];
      if(v.visible) {
        bar_values[i] = {};
        if(runs.length > 0) {
          for(const run of runs) {
            // NOTE: Run index >= 0 makes variables use run results vector,
            // scaled to the just established chart time scale.
            this.run_index = run;
            if(stat_bars) {
              const rri = selx.resultIndex(v.displayName);
              let bv;
              if(rri >= 0) {
                const
                    r = selx.runs[this.run_index],
                    rr = r.results[rri];
                if(selx.selected_scale === 'sec') {
                  bv = r.solver_seconds;
                } else if(selx.selected_statistic === 'N') {
                  bv = rr.N;
                } else if(selx.selected_statistic === 'sum') {
                  bv = rr.sum;
                } else if(selx.selected_statistic === 'mean') {
                  bv = rr.mean;
                } else if(selx.selected_statistic === 'sd') {
                  bv = Math.sqrt(rr.variance);
                } else if(selx.selected_statistic === 'min') {
                  bv = rr.minimum;
                } else if(selx.selected_statistic === 'max') {
                  bv = rr.maximum;
                } else if(selx.selected_statistic === 'nz') {
                  bv = rr.non_zero_tally;
                } else if(selx.selected_statistic === 'except') {
                  bv = rr.exceptions;
                } else if(selx.selected_statistic === 'last') {
                  bv = rr.last;
                }
                bar_values[i][this.run_index] = bv;
                minv = Math.min(minv, bv);
                maxv = Math.max(maxv, bv);
              }
            } else {
              v.computeVector();
              minv = Math.min(minv, v.lowestValueInVector);
              maxv = Math.max(maxv, v.highestValueInVector);
            }
          }
        } else {
          this.run_index = -1;
          v.computeVector();
          minv = Math.min(minv, v.lowestValueInVector);
          maxv = Math.max(maxv, v.highestValueInVector);
        }
      } 
    }

    // Now all vectors have been computed. If `display` is FALSE, this
    // indicates that data is used only to save model results.
    if(!display) return;
    
    // Define the bins when drawing as histogram.
    if(this.histogram) {
      this.value_range = maxv - minv;
      if(this.value_range > VM.NEAR_ZERO) {
        let scalar = 1,
            // NOTE: Use 10% wider range to compute bins.
            bin_size = 1.1 * this.value_range / this.bins;
        // Scale up until bin size > 1
        while(bin_size < 1) {
          bin_size *= 10;
          scalar *= 10;
        }
        // Now look for nearest "nice" number as bin size
        let base = 0,
            base_n = [1, 2, 5];
        while(!base) {
          for(let i = 0; i < base_n.length; i++) {
            if(bin_size <= base_n[i]) {
              base = base_n[i];
              break;
            }
          }
          if(!base) {
            for(let i = 0; i < base_n.length; i++) {
              base_n[i] *= 10;
            }
          }
        }
        // Scale back
        base /= scalar;
        this.bin_interval = base;
        this.first_bin = Math.floor(minv / base + 1 + VM.NEAR_ZERO) * base;
        // NOTE: floor rounds to 0, so subtract 1 interval if minv < 0
        if(minv < 0) this.first_bin -= base;
      }
    }

    // Compute tallies only for histogram    
    if(this.histogram) {
      // For histograms, minv = 0 and maxv = highest tally
      minv = 0;
      maxv = 0;
      for(let i = 0; i < this.variables.length; i++) {
        const v = this.variables[i];
        if(v.visible) {
          if(runs.length > 0) {
            for(const run of runs) {
              // NOTE: Run index >= 0 makes variables use run results vector.
              this.run_index = run;
              v.computeVector();
              v.tallyVector();
              maxv = Math.max(...v.bin_tallies);
            }
          } else {
            this.run_index = -1;
            v.computeVector();
            v.tallyVector();
            maxv = Math.max(...v.bin_tallies);
          }
        } 
      }
    }

    // The time step vector is not used when making a histogram or when
    // plotting run statistics as bar chart. 
    if(!(this.histogram || stat_bars)) this.sortLeadTimeVector();

    // Draw the grid rectangle
    this.addSVG(['<rect id="c_h_a_r_t__a_r_e_a__ID*" x="', rl, '" y="', rt,
        '" width="', rw, '" height="', rh,
        '" fill="white" stroke="gray" stroke-width="1"></rect>']);
    // Draw the title (if shown) in a larger font
    if(this.show_title) {
      this.addText(rl + rw / 2, 0.7*font_height,
          this.title + runnrs, 'black', font_height*1.2, 'font-weight="bold"');
    }
    
    if(time_steps > 0) {
      let dx = 0,
          dy = 0,
          x = 0,
          y = rt + rh + font_height;
      // Store XY-area coordinates for use by Chart Manager.
      this.plot_ox = rl;
      this.plot_oy = rt + rh;
      this.plot_width = rw;
      this.plot_height = rh;
      if(this.histogram) {
        // Draw bin boundaries along the horizontal axis
        dx = rw / this.bins;
        x = rl;
        let b = this.first_bin - this.bin_interval;
        for(let i = 0; i < this.bins; i++) {
          // Draw ticks to emphasize that numbers are bin *boundaries*
          this.addSVG(['<line x1="', x, '" y1="', rt + rh - 3, '" x2="', x,
              '" y2="', rt + rh + 3, '" stroke="black" stroke-width="1.5"/>']);
          this.addText(x, y, VM.sig2Dig(b));
          b += this.bin_interval;
          x += dx;
        }
        this.addText(x + 5, y, VM.sig2Dig(b), 'black', font_height,
            'text-anchor="end"');
      } else if(stat_bars && runs.length > 0) {
        const dx = rw / runs.length;
        // If multiple bars (`vv` is number of visible variables), draw
        // ticks to mark horizontal area per run number.
        if(vv > 1) {
          this.addSVG(['<line x1="', rl, '" y1="', rt + rh,
              '" x2="', rl, '" y2="', rt + rh + 6,
              '" stroke="black" stroke-width="1.5"/>']);
        }
        x = rl + dx;
        for(const run of runs) {
          if(vv > 1) {
            this.addSVG(['<line x1="', x, '" y1="', rt + rh,
                '" x2="', x, '" y2="', rt + rh + 6,
                '" stroke="black" stroke-width="1.5"/>']);
          }
          if(selx.plot_dimensions.length > 0) {
            // Draw run selectors for each plot dimension above each other.
            const ac = selx.combinations[run];
            let pdy = y;
            for(const pd of selx.plot_dimensions) {
              this.addText(x - dx / 2, pdy, ac[pd]);
              pdy += font_height;
            }
          } else {
            // Draw experiment number in middle of its horizontal area.
            this.addText(x - dx / 2, y, '#' + run);
          }
          x += dx;
        }
      } else {
        // Draw the time labels along the horizontal axis.
        // TO DO: Convert to time units if modeler checks this additional option.
        // Draw the time step duration in bottom-left corner.
        this.addText(1, y, 'dt = ' + this.timeScaleAsString(this.time_scale),
            'black', font_height, 'text-anchor="start"');
        // Calculate width corresponding to one half time step.
        const half_t = rw * 0.5 / time_steps;
        // Always display first time step number halfway the first 1 t interval.
        this.addText(rl + half_t, y, first_step);
        // Display additional labels only if there are time steps in-between.
        if(time_steps > 1) {
          // Also display the last time step halfway the last 1 t interval.
          const ets = '' + last_step;
          this.addText(rl + rw - half_t, y, ets);
          // Maximize the number of labels shown depending on the chart width.
          // NOTE: `ets` is the highest number; use twice its width as divisor.
          const max_labels = Math.floor(rw / (2 * ets.length * font_width));
          // Select the most appropriate increment (with a minimum of 1)
          const step = this.labelStep(time_steps, max_labels, 1);
          // Calculate the horizontal pixel equivalent of 1 X unit.
          dx = rw * step / time_steps;
          let fr = first_step / step;
          fr = 1 + Math.floor(fr) - fr;
          // NOTE: Avoid "crowding" of labels near the origin.
          if(fr < 0.5) fr += 1;
          // NOTE: Add `half_t` to start relative to the middle of the first interval.
          let x = rl + half_t + dx * fr,
              t = Math.round(first_step + fr*step);
          // NOTE: Add 1 if step = 2 and first time step is odd.
          if(step == 2 && time_steps % 2 == 1 && t - first_step == 1) {
            t++;
            x += dx / 2;
          }
          // Also avoid "crowding" near the end of the scale.
          while(t < last_step - 0.5*step) {
            this.addText(x, y, t);
            x += dx;
            t += step;
          }
        }
        // NOTE: Ignore "stacked" when displaying *multiple* run results.
        if(runs.length <= 1) {
          // Add up the stacked variable vectors to adjust min and max if needed.
          const sv = Array(time_steps + 1).fill(0);
          for(const v of this.variables) {
            // For a *single* experiment run, recompute vector for that run.
            if(runs.length === 1) {
              this.run_index = runs[0];
              v.computeVector();
            }
            if(v.visible && v.stacked) {
              for(let t = 0; t < v.vector.length; t++) {
                sv[t] += v.vector[t];
              }
            }
            // NOTE: Do this INSIDE the loop, as MIN and MAX of stacked variables
            // must be calculated on the basis of each line in the stacked chart.
            for(let t = 0; t < sv.length; t++) {
              const v = sv[t];
              if(!isNaN(v)) {
                minv = Math.min(minv, v);
                maxv = Math.max(maxv, v);
              }
            }
          }
        }
        // Ignore minute differences from 0 to prevent unnecessary whitespace.
        if(Math.abs(minv) < VM.SIG_DIF_FROM_ZERO) minv = 0;
        if(Math.abs(maxv) < VM.SIG_DIF_FROM_ZERO) maxv = 0;
        // Extend by 10% on both ends.
        maxv *= (maxv > 0 ? 1.1 : 0.9);
        if(minv < 0) minv *= 1.1;
      }
      // For bar chart, maxv must be non-negative.
      if(stat_bars) maxv = Math.max(maxv, 0);
      const range = maxv - minv;
      this.plot_min_y = minv;
      this.plot_max_y = maxv;
      if(range > 0) {
        const step = this.labelStep(range, 5, VM.NEAR_ZERO);
        let x0 = rl,
            y0 = rt + rh,
            maxy = Math.ceil(maxv / step) * step,
            miny = (minv >= 0 ? 0 : -Math.ceil(-minv / step) * step);
        this.plot_min_y = miny;
        this.plot_max_y = maxy;
        y = miny;
        const labels = [];
        while(y - maxy <= VM.NEAR_ZERO) {
          // NOTE: Large values having exponents will be "neat" numbers,
          // so then display fewer decimals, as these will be zeroes.
          const v = (Math.abs(y) > 1e5 ? VM.sig2Dig(y) : VM.sig4Dig(y));
          // NOTE: Force number to become a string so that its length
          // attribute can be used when drawing it.
          labels.push('' + v);
          y += step;
        }
        // First calculate dy as the vertical distance between labels.
        dy = rh / (labels.length - 1);
        // Draw labels, starting at lowest Y.
        y = rt + rh;
        x = rl - 5;
        for(let i = 0; i < labels.length; i++) {
          this.addText(x, y, labels[i], 'black', font_height,
              'text-anchor="end"');
          y -= dy;
        }
        // Then calculate dx and dy as the respective horizontal and
        // vertical pixel equivalents of one unit.
        dx = rw / time_steps;
        dy = rh / (maxy - miny);
        y0 = rt + rh + dy * miny;
        // Draw axes Y = 0 and X = 0 in black and slightly thicker.
        this.addSVG(['<line x1="', x0, '" y1="', y0, '" x2="', x0 + rw,
            '" y2="', y0, '" stroke="black" stroke-width="2"/>']);
        this.addSVG(['<line x1="', x0, '" y1="', rt, '" x2="', x0,
            '" y2="', rt + rh, '" stroke="black" stroke-width="2"/>']);

        // Now draw the chart's data elements.
        // NOTE: `vv` still is the number of visible chart variables.
        if(vv > 0 && this.histogram) {
          dx = rw / this.bins;
          const
              rcnt = (runs.length > 1 ? runs.length : 1),
              barw = 0.9 * dx / vv / rcnt,
              varsp = 0.05 * dx / vv,
              barsp = varsp / rcnt,
              fsl = CHART_MANAGER.fill_styles.length;
          let mask,
              vnr = 0;
          for(const v of this.variables) if(v.visible) {
            if(rcnt > 1) {
              // Draw bars for each run with a different fill pattern.
              for(let j = 0; j < rcnt; j++) {
                // NOTE: Run index >= 0 makes variables use run results vector.
                this.run_index = runs[j];
                v.computeVector();
                v.tallyVector();
                v.setBars(
                    rl + (vnr*rcnt + j)*(barw + barsp) + (vnr + 0.5)*varsp,
                    y0, dx, dy, barw);
                if(j > 0) {
                  mask = ' mask="url(#' +
                      CHART_MANAGER.fill_styles[(j - 1) % fsl] + '-mask)"';
                } else {
                  mask = '';
                }
                this.addSVG(['<path d="', v.line_path, '" stroke="', v.color,
                    '" stroke-width="', v.line_width, '" fill="', v.color,
                    '" fill-opacity="0.55"', mask,
                    ' pointer-events="none" />']);
                if(mask) {
                  // Draw contour again, as mask is also applied to this line.
                  this.addSVG(['<path d="', v.line_path,
                      '" stroke="', v.color,
                      '" stroke-width="', v.line_width,
                      '" fill="none" pointer-events="none" />']);
                }
              }
            } else {
              // No need to re-compute or re-tally vector.
              v.setBars(rl + vnr * (barw + barsp + varsp) + varsp,
                  y0, dx, dy, barw);
              this.addSVG(['<path d="', v.line_path, '" stroke="', v.color,
                  '" stroke-width="', v.line_width, '" fill="', v.color,
                  '" fill-opacity="0.4" pointer-events="none" />']);
            }
            vnr++;
          }
        } else if(vv > 0 && stat_bars) {
          dx = rw / runs.length;
          const
              varsp = dx / vv,
              barw = 0.85 * varsp,
              barsp = 0.075 * varsp;
          let vcnt = 0;
          for(let vi = 0; vi < this.variables.length; vi++) {
            const v = this.variables[vi];
            if(v.visible) {
              for(let ri = 0; ri < runs.length; ri++) {
                const
                    rnr = runs[ri],
                    bv = bar_values[vi][rnr],
                    barh = Math.abs(bv) * dy,
                    bart = y0 - Math.max(0, bv) * dy;
                x = rl + ri * dx + barsp + vcnt * varsp;
                this.addSVG(['<rect x="', x, '" y="', bart,
                    '" width="', barw, '" height="', barh,
                    '" stroke="', v.color, '" stroke-width="',
                    v.line_width, '" fill="', v.color,
                    '" fill-opacity="0.4" pointer-events="none"></rect>']);
              }
              vcnt += 1;
            }
          }
        } else if(vv > 0) {
          // Draw areas of stacked variables.
          if(runs.length <= 1) {
            // Draw the variables that are "stacked" first UNLESS multiple runs.
            // NOTE: As these areas are filled in a semi-transparent color,
            // their bottom contour is the top contour of the previous area;
            // these cumulative "previous" Y-values are stored in the vector
            // `offset`.
            // The initial offset is zero for each time step.
            const offset = Array(time_steps + 2).fill(0);
            for(const v of this.variables) {
              // Always clear the line path string.
              v.line_path = '';
              if(v.visible && v.stacked) {
                // For a single experiment run, recompute vector for that run
                if(runs.length === 1) {
                  this.run_index = runs[0];
                  v.computeVector();
                }
                // Vector may have to be sorted in some way.
                const vect = v.vector.slice();
                if(v.sorted === 'asc') {
                  // Sort values in ascending order.
                  vect.sort();
                } else if(v.sorted === 'desc') {
                  // Sort values in descending order.
                  vect.sort((a, b) => { return b - a; });
                } else if(this.time_step_numbers) {
                  // Fill vector with its values sorted by time step.
                  for(let i = 0; i < v.vector.length; i++) {
                    vect[i] = v.vector[this.time_step_numbers[i]];
                  }
                }
                // NOTE: Add x-value to x0, but SUBTRACT y-value from y0!
                x = x0;
                y = y0 - vect[0]*dy - offset[0];
                // Begin with the top contour.
                const path = ['M', x, ',', y];
                for(let t = 1; t < vect.length; t++) {
                  // First draw line to the Y for time step t.
                  y = y0 - (vect[t] + offset[t])*dy;
                  path.push(`L${x},${y}`);
                  // Then move right for the duration of time step t.
                  x += dx;
                  path.push(`L${x},${y}`);
                }
                // NOTE: Store the upper contour path as attribute of the
                // chart variable.
                v.line_path = path.join('');
                // Now add the path for the bottom contour (= offset) ...
                for(let t = vect.length - 1; t > 0; t--) {
                  y = y0 - offset[t]*dy;
                  path.push(`L${x},${y}`);
                  x -= dx;
                  path.push(`L${x},${y}`);
                  // ... while computing the new offset.
                  offset[t] += vect[t];
                }
                // Draw the filled area with semi-transparent color.
                this.addSVG(['<path d="', path.join(''),
                    'z" stroke="none" fill="', v.color,
                    '" fill-opacity="0.35" pointer-events="none"/>']);
              }
            }
          }
          // Now draw all lines.
          let sda;
          for(const v of this.variables) {
            if(runs.length > 1) {
              // Draw a line for each run with a different line pattern.
              for(let i = 0; i < runs.length; i++) {
                v.line_path = '';
                // NOTE: Run index >= 0 makes variables use run results vector.
                this.run_index = runs[i];
                v.computeVector();
                v.setLinePath(x0, y0, dx, dy);
                if(i > 0) {
                  sda = '" stroke-dasharray="' +
                     UI.sda[pats[(i - 1) % pats.length]];
                } else {
                  sda = '';
                }
                this.addSVG(['<path d="', v.line_path, '" stroke="', v.color,
                    '" stroke-width="', v.line_width * 2, sda, 
                    '" fill="none" fill-opacity="0" pointer-events="none" />']);
              }
            } else {
              // No need to recompute vector.
              v.setLinePath(x0, y0, dx, dy);
              this.addSVG(['<path d="', v.line_path, '" stroke="', v.color,
                  '" stroke-width="', v.line_width * 2,
                  '" fill="none" fill-opacity="0" pointer-events="none" />']);
            }
          }
        }
      }
    }
    // Add the SVG disclaimer.
    this.addSVG('Sorry, your browser does not support inline SVG.</svg>');
    // Insert the SVG into the designated DIV.
    // NOTE: The event listeners on the SVG pass the X position of the cursor,
    // whether the time step should be displayed, and the offset of the chart
    // rectangle (in pixel units) within the container.
    CHART_MANAGER.showChartImage(this);
    // Record and "publish" chart area rectangle properties.
    this.chart_area_rect = {top: rt, left: rl, height: rh, width: rw};
  }

  get statisticsAsString() {
    if(CHART_MANAGER.drawing_chart) {
      return '(chart statistics not calculated yet)';
    }
    const stats = ['Variable\tN\tMin.\tMax.\tMean\tSt.dev.\tSum\t#NZ\t#\u26A0'];
    for(const v of this.variables) if(v.visible) {
      // NOTE: Tab-separated values.
      stats.push([v.displayName, v.N, v.minimum, v.maximum,
          v.mean, Math.sqrt(v.variance), v.sum,
          v.non_zero_tally, v.exceptions].join('\t'));
    }
    let str = stats.join('\n');
    // Use decimal comma if so configured.
    if(MODEL.decimal_comma) str = str.replace(/\./g, ',');
    return str;
  }
  
  get dataAsString() {
    if(CHART_MANAGER.drawing_chart) {
      return '(chart statistics not calculated yet)';
    }
    // NOTE: Unlike statistics, series data is output in columns.
    const
        data = [],
        vbl = [],
        line = ['t'];
    // First line: column labels (variable names, but time step in first column).
    for(const v of this.variables) if(v.visible) {
      line.push(v.displayName);
      vbl.push(v);
    }
    // Use constants to avoid array lookups in potentially long loops.
    const n = vbl.length;
    if(n === 0) return '(no data)';
    // NOTE: Tab-separated values.
    data.push(line.join('\t'));
    // Assume that all vectors have equal length.
    const steps = vbl[0].vector.length;
    // NOTE: Add the "absolute" time step on the model time scale.
    let t = MODEL.start_period - 1;
    for(let i = 0; i < steps; i++) {
      const line = [t];
      for(const v of vbl) line.push(v.vector[i]);
      // NOTE: Tab-separated values.
      data.push(line.join('\t'));
      t++;
    }
    // Return lines as a single string.
    let str = data.join('\n');
    // Use decimal comma if so configured.
    if(MODEL.decimal_comma) str = str.replace(/\./g, ',');
    return str;
  }
  
  differences(c) {
    // Return "dictionary" of differences, or NULL if none.
    const d = differences(this, c, UI.MC.CHART_PROPS);
    // Check for new and modified variables.
    for(const v of this.variables) {
      const
          vn = v.displayName,
          vid = UI.nameToID(vn);
      let mv = null;
      for(const cv of c.variables) if(UI.nameToID(cv.displayName) === vid) {
        mv = cv;
        break;
      }
      if(mv) {
        const diff = v.differences(mv);
        if(diff) d[vid] = [UI.MC.MODIFIED, UI.htmlEquationName(vn), diff];
      } else {
        d[vid] = [UI.MC.ADDED, UI.htmlEquationName(vn)];
      }
    }
    // Check for deleted variables.
    for(const cv of c.variables) {
      const
          cvn = cv.displayName,
          cvid = UI.nameToID(cvn);
      let mv = null;
      for(const v of this.variables) if(UI.nameToID(v.displayName) === cvid) {
        mv = v;
        break;
      }
      if(!mv) d[cvid] = [UI.MC.DELETED, UI.htmlEquationName(cvn)];
    }
    if(Object.keys(d).length > 0) return d;
    return null;
  }
  
} // END of class Chart


// CLASS ColorScale
class ColorScale {
  constructor(range) {
    this.set(range);
  }

  set(range) {
    // NOTE: Range must be a predefined one, or blank scale is returned.
    if(['br', 'rb', 'gr', 'rg'].indexOf(range) < 0) {
      this.blank = true;
      this.range = 'no';
      return;
    }
    this.range = range;
    this.blank = false;
    // Define palette as string of one-letter color codes and associated RGB.
    const palette = 'bgrwy',
          colors = [
            [ 46, 134, 222], // blue = 0
            [ 16, 172, 132], // green = 1
            [238,  82,  83], // red = 2
            [254, 251, 255], // white (with tinge of purple) = 3
            [254, 202, 87]]; // yellow = 4
    if(range.indexOf('b') >= 0) {
      this.via = colors[3]; // white
    } else {
      this.via = colors[4]; // yellow     
    }
    this.from = colors[palette.indexOf(range.charAt(0))];
    this.to = colors[palette.indexOf(range.charAt(1))];
  }
  
  rgb(n) {
    // Return RGB color for normalized value `n`.
    // NOTE: Return empty string if no predefined color scale.
    if(this.blank) return '';
    const a = [];
    if(n < 0.5) {
      for(let i = 0; i < 3; i++) {
        a.push(Math.round(this.from[i] + 2*n*(this.via[i] - this.from[i])));
      }
    } else {
      for(let i = 0; i < 3; i++) {
        a.push(Math.round(this.via[i] + (2*n - 1)*(this.to[i] - this.via[i])));
      }
    }
    return(`rgba(${a.join(',')},0.75)`);
  }

} // END of class ColorScale


// CLASS ActorSelector
class ActorSelector {
  constructor() {
    this.selector = '';
    // NOTE: actor weights can be specified as expressions in the Actors dialog
    // and hence can already be made experiment-specific => only their round
    // flags needs to be configurable 
    this.round_sequence = '';
  }
  
  get asXML() {
    return ['<asel><selector>', xmlEncoded(this.selector),
      '</selector><round-sequence>', this.round_sequence,
      '</round-sequence></asel>'].join('');
  }
  
  initFromXML(node) {
    this.selector = xmlDecoded(nodeContentByTag(node, 'selector'));
    this.round_sequence = nodeContentByTag(node, 'round-sequence');
  }
  
} // END of class ActorSelector


// CLASS ExperimentRunResult
class ExperimentRunResult {
  constructor(r, v, a='') {
    // NOTE: Constructor can be called with `v` a chart variable, a dataset,
    // or an XML node. When `v` is the equations dataset, then `a` is the
    // identifier of the dataset modifier to be used. 
    this.run = r;
    if(v instanceof ChartVariable) {
      this.x_variable = true;
      this.object_id = v.object.identifier;
      this.attribute = v.attribute;
      this.was_ignored = MODEL.ignored_entities[this.object_id] || false;
      if(this.was_ignored) {
        // Chart variable entity was ignored => all results are undefined.
        this.vector = [];
        this.N = VM.UNDEFINED;
        this.sum = VM.UNDEFINED;
        this.mean = VM.UNDEFINED;
        this.variance = VM.UNDEFINED;
        this.minimum = VM.UNDEFINED;
        this.maximum = VM.UNDEFINED;
        this.non_zero_tally = VM.UNDEFINED;
        this.exceptions = VM.UNDEFINED;
        this.last = VM.UNDEFINED;
      } else {
        // Copy relevant properties of chart variable `v`.
        // NOTE: Vector must be computed, unless the vector already has
        // length greater than 0. Computation will be for the running
        // experiment, so NO need to set the run_index for the chart of
        // this variable.
        v.computeVector();
        this.N = v.N;
        this.sum = v.sum;
        this.mean = v.mean;
        this.variance = v.variance;
        this.minimum = v.minimum;
        this.maximum = v.maximum;
        this.non_zero_tally = v.non_zero_tally;
        this.exceptions = v.exceptions;
        // NOTES:
        // (1) Run results are vectors: "initial value" v[0] is also stored.
        // (2) Use slice() to make a copy of the vector, as the variable's
        //     vector may change again (for the next experiment, or when
        //     drawing a chart after a run).
        // (3) slice(0, N) takes elements 0 to N-1, so add 1 to run length. 
        this.vector = v.vector.slice(0, this.run.time_steps + 1);
        // Use the last step of the experiment time period for the LAST
        // statistic.
        this.last = (this.vector.length > 0 ?
            this.vector[this.vector.length - 1] : VM.UNDEFINED);
        // NOTE: For sensitivity analyses, the vector is NOT stored because
        // the SA reports only the descriptive statistics.
        if(this.run.experiment === SENSITIVITY_ANALYSIS.experiment) {
          this.vector.length = 0;
        }
      }
    } else if(v instanceof Dataset) {
      // This dataset will be an "outcome" dataset => store statistics only
      // @@TO DO: deal with wildcard equations: these will have *multiple*
      // vectors associated with numbered entities (via #) and therefore
      // *all* these results should be stored (with # replaced by its value).
      this.x_variable = false;
      this.object_id = v.identifier;
      if(v === MODEL.equations_dataset && a) {
        this.attribute = a;
      } else {
        this.attribute = '';
        // NOTE: The running experiment determines the modifier.
        const xx = MODEL.running_experiment;
        if(xx) {
          const mm = v.matchingModifiers(xx.activeCombination);
          // Use the first matching selector, as this is the most specific one.
          if(mm.length > 0) this.attribute = mm[0].selector;
        }
      }
      this.sum = 0;
      this.minimum = VM.PLUS_INFINITY;
      this.maximum = VM.MINUS_INFINITY;
      this.non_zero_tally = 0;
      this.exceptions = 0;
      const
          // NOTE: Run result dataset selector will be plain (no wildcards).
          x = v.modifiers[this.attribute].expression,
          t_end = MODEL.end_period - MODEL.start_period + 1;
      // N = # time steps.
      this.N = t_end;
      let r,
          // Use the time-scaled (!) vector of the dataset...
          rv = v.vector;
      if(x) {
        // ... or use the result of the modifier expression if defined.
        if(x.isStatic) {
          // For static expressions, statistics can be inferred directly.
          r = x.result(0);
          this.mean = r;
          this.sum = r * t_end;
          this.minimum = r;
          this.maximum = r;
          if(r < VM.MINUS_INFINITY || r > VM.PLUS_INFINITY) {
            this.exceptions = t_end;
          } else if(Math.abs(r) > VM.NEAR_ZERO) {
            this.non_zero_tally = t_end;
          }
          // Preclude further computation of statistics.
          rv = null;
        } else {
          // Ensure that expression vector is computed in full 
          for(let t = 1; t <= t_end; t++) x.compute(t);
          rv = x.vector;
        }
      }
      if(rv) {
        // Do not include t = 0 in statistics.
        for(let t = 1; t <= t_end; t++) {
          r = rv[t];
          // Map undefined values and all errors to 0
          if(r < VM.MINUS_INFINITY || r > VM.PLUS_INFINITY) {
            this.exceptions++;
            r = 0;
          } else if(Math.abs(r) > VM.NEAR_ZERO) {
            this.sum += r;
            this.non_zero_tally++;
          }
          this.minimum = Math.min(this.minimum, r);
          this.maximum = Math.max(this.maximum, r);
        }
        // Compute the mean.
        this.mean = this.sum / t_end;
        // Compute the variance.
        let sumsq = 0;
        for(let t = 1; t <= t_end; t++) {
          r = rv[t];
          // Map undefined values and all errors to 0.
          if(r < VM.MINUS_INFINITY || r > VM.PLUS_INFINITY) r = 0;
          sumsq += Math.pow(r - this.mean, 2);
        }
        this.variance = sumsq / t_end;
        this.last = rv[t_end];
      }
      // Do not store the RR vector, since outcomes are meant to reduce
      // the amount of memory (and model file size).
      this.vector = [];
    } else {
      // Parsing run results while loading a file: `v` is an XML tree.
      this.initFromXML(v);
    }
    // The vector MAY need to be scaled to model time by different methods,
    // but since this is likely to be rare, such scaling is performed
    // "lazily", so the method-specific vectors are initially empty.
    this.resetScaledVectors();
  }

  resetScaledVectors() {
    // Clear the special vectors, so they will be recalculated.
    this.scaled_vectors = {'NEAREST': [], 'MEAN': [], 'SUM': [], 'MAX': []};
  }
  
  get displayName() {
    // Return the name of the result variable.
    const
        obj = MODEL.objectByID(this.object_id),
        dn = obj.displayName;
    // NOTE: For equations dataset, only display the modifier selector.
    if(obj === MODEL.equations_dataset) {
      const m = obj.modifiers[this.attribute.toLowerCase()];
      if(m) return m.selector;
      console.log('WARNING: Run result of non-existent equation',
          this.attribute);
      return this.attribute;
    }
    return (this.attribute ? dn + '|' + this.attribute : dn);
  }

  get asXML() {
    const
        data = (this.was_ignored ? '' : packVector(this.vector)),
        xml = ['<run-result',
            (this.x_variable ? ' x-variable="1"' : ''),
            (this.was_ignored ? ' ignored="1"' : ''),
            '><object-id>', xmlEncoded(this.object_id),
            '</object-id><attribute>', xmlEncoded(this.attribute),
            '</attribute>'];
    // NOTE: Reduce model size by saving only non-zero statistics.
    if(this.N) xml.push('<count>', this.N, '</count>');
    if(this.sum) xml.push('<sum>', this.sum, '</sum>');
    if(this.mean) xml.push('<mean>', this.mean, '</mean>');
    if(this.variance) xml.push('<variance>', this.variance, '</variance>');
    if(this.minimum) xml.push('<minimum>', this.minimum, '</minimum>');
    if(this.maximum) xml.push('<maximum>', this.maximum, '</maximum>');
    if(this.non_zero_tally) xml.push('<non-zero-tally>',
        this.non_zero_tally, '</non-zero-tally>');
    if(this.last) xml.push('<last>', this.last, '</last>');
    if(this.exceptions) xml.push('<exceptions>',
        this.exceptions, '</exceptions>');
    if(data) xml.push('<vector b62="1">', data, '</vector>');
    xml.push('</run-result>');
    return xml.join('');
  }

  initFromXML(node) {
    this.x_variable = nodeParameterValue(node, 'x-variable') === '1';
    this.was_ignored = nodeParameterValue(node, 'ignored') === '1';
    this.object_id = xmlDecoded(nodeContentByTag(node, 'object-id'));
    // NOTE: Special check to guarantee upward compatibility to version
    // 1.3.0 and higher.
    let attr = nodeContentByTag(node, 'attribute');
    if(this.object_id === UI.EQUATIONS_DATASET_ID &&
        !earlierVersion(MODEL.version, '1.3.0')) attr = xmlDecoded(attr);
    this.attribute = attr;
    this.N = safeStrToInt(nodeContentByTag(node, 'count'), 0);
    this.sum = safeStrToFloat(nodeContentByTag(node, 'sum'), 0);
    this.mean = safeStrToFloat(nodeContentByTag(node, 'mean'), 0);
    this.variance = safeStrToFloat(nodeContentByTag(node, 'variance'), 0);
    this.minimum = safeStrToFloat(nodeContentByTag(node, 'minimum'), 0);
    this.maximum = safeStrToFloat(nodeContentByTag(node, 'maximum'), 0);
    this.non_zero_tally = safeStrToInt(nodeContentByTag(node, 'non-zero-tally'), 0);
    this.last = safeStrToFloat(nodeContentByTag(node, 'last'), 0);
    this.exceptions = safeStrToInt(nodeContentByTag(node, 'exceptions'), 0);
    const cn = childNodeByTag(node, 'vector');
    if(cn && !this.was_ignored) {
      const b62 = nodeParameterValue(cn, 'b62') === '1';
      this.vector = unpackVector(nodeContent(cn), b62);
    } else {
      this.vector = [];
    }
  }
  
  valueAtModelTime(t, mtsd, method, periodic) {
    // Return the experiment result value for model time `t`.
    // NOTE: Result for t = 0 should always be v[0], irrespective of scaling.
    if(t === 0 || this.was_ignored) return VM.UNDEFINED;
    // Now t will be > 0.
    const
        rtsd = this.run.time_step_duration,
        // NOTE: Absolute scaling means "use time step t as index".
        t_multiplier = (method === 'ABS' ||
            Math.abs(rtsd - mtsd) < VM.NEAR_ZERO ? 1 : mtsd / rtsd);
    let v = null,
        ti = t;
    if(t_multiplier !== 1 && !method) method = 'NEAREST';
    if(t_multiplier === 1) {
      // If same time scale, use the result vector without any scaling.
      // NOTE: vector[0] corresponds with t = 1.
      v = this.vector;
    } else if(this.scaled_vectors.hasOwnProperty(method)) {
      // Other methods: compute entire vector, anticipating on more "gets".
      v = this.scaled_vectors[method];
      if(v.length <= 0) {
        // Infer the "official" method name.
        let mcode = method.toLowerCase();
        if(mcode === 'mean' || mcode === 'sum') mcode = 'w-' + mcode;
        // NOTE: scaleData expects "pure data", so slice off v[0].
        VM.scaleDataToVector(this.vector.slice(1), v, rtsd, mtsd, MODEL.runLength,
            1, VM.UNDEFINED, periodic, mcode);
        // NOTE: The scaled vector WILL have an "initial value" v[0], which
        // will depend on periodicity.
      }
    } else {
      // Unrecognized method.
      return VM.UNDEFINED;
    }
    // Apply periodicity while ignoring v[0] (which is only used when t=0).
    if(periodic) ti = (ti - 1) % (v.length - 1) + 1;
    if(ti < v.length) return v[ti];
    return VM.UNDEFINED;
  }

} // END of class ExperimentRunResult

// CLASS BlockMessages
class BlockMessages {
  constructor(node=null) {
    if(node) {
      this.initFromXML(node);
    }
  }
  
  get asXML() {
    return ['<block-msg nr="', this.block_number,
      '" time="', this.solver_time, '" ssecs="', this.solver_secs,
      '"><text>', xmlEncoded(this.messages), '</text></block-msg>'].join('');
  }
  
  initFromXML(node) {
    this.block_number = safeStrToInt(nodeParameterValue(node, 'nr'));
    this.solver_time = safeStrToFloat(nodeParameterValue(node, 'time'));
    this.solver_secs = safeStrToFloat(nodeParameterValue(node, 'ssecs'));
    this.messages = xmlDecoded(nodeContentByTag(node, 'text'));
  }
  
  get warningCount() {
    // Returns the number of occurrences of "-- Warning: (t=" in the messages
    const m = this.messages.match(/-- Warning: \(t=/g);
    return m ? m.length : 0;
  }
  
} // END of class BlockMessages

// CLASS ExperimentRun
class ExperimentRun {
  constructor(x, n) {
    this.experiment = x;
    this.number = n;
    this.combination = [];
    this.time_started = 0;
    this.time_recorded = 0;
    this.time_steps = MODEL.end_period - MODEL.start_period + 1;
    this.time_step_duration = 1; // Default time step is 1 hour
    this.results = [];
    this.block_messages = [];
    this.warning_count = 0;
    this.solver_seconds = 0;
  }
  
  start() {
    // Initialize this run.
    this.combination = this.experiment.combinations[this.number].slice();
    this.time_started = new Date().getTime();
    this.time_recorded = 0;
    this.results = [];
  }

  get asXML() {
    // NOTE: Do not save runs without results.
    if(this.results.length === 0) return '';
    let r = '';
    for(const res of this.results) r += res.asXML;
    let bm = '';
    for(const msg of this.block_messages) bm += msg.asXML;
    return ['<experiment-run number="', this.number,
        '" started="', this.time_started,
        '" recorded="', this.time_recorded,
        '"><x-title>', xmlEncoded(this.experiment.title),
        '</x-title><x-combi>', this.combination.join(' '),
        '</x-combi><time-steps>', this.time_steps,
        '</time-steps><delta-t>', this.time_step_duration,
        '</delta-t><results>', r,
        '</results><messages>', bm,
        '</messages></experiment-run>'].join('');
  }

  initFromXML(node) {
    this.number = safeStrToInt(nodeParameterValue(node, 'number'));
    this.time_started = safeStrToInt(nodeParameterValue(node, 'started'));
    this.time_recorded = safeStrToInt(nodeParameterValue(node, 'recorded'));
    const t = xmlDecoded(nodeContentByTag(node, 'x-title'));
    // NOTE: For sensitivity analysis runs, the experiment title is undefined.
    if(t != this.experiment.title) {
      UI.warn(`Run title "${t}" does not match experiment title "` +
          this.experiment.title + '"');
    }
    this.combination = nodeContentByTag(node, 'x-combi').split(' ');
    this.time_steps = safeStrToInt(nodeContentByTag(node, 'time-steps'));
    this.time_step_duration = safeStrToFloat(nodeContentByTag(node, 'delta-t'));
    let n = childNodeByTag(node, 'results');
    if(n) {
      for(const c of n.childNodes) if(c.nodeName === 'run-result') {
        this.results.push(new ExperimentRunResult(this, c));
      }
    }
    n = childNodeByTag(node, 'messages');
    if(n) {
      for(const c of n.childNodes) if(c.nodeName === 'block-msg') {
        this.block_messages.push(new BlockMessages(c));
      }
    }
    for(const bm of this.block_messages) {
      this.warning_count += bm.warningCount;
      this.solver_seconds += bm.solver_secs;
    }
  }

  addResults() {
    // Add the experiment chart variables and outcomes as run results.
    // NOTE: Experiments may have different time step durations.
    this.time_step_duration = MODEL.timeStepDuration;
    // Reset each output chart to achieve that all chart variables will
    // be recomputed for the current model settings.
    for(const c of this.experiment.charts) c.resetVectors();
    // Calculate number of vectors/outcomes/equations to store.
    this.oc_list = MODEL.outcomes;
    // NOTE: All equations are also considered to be outcomes EXCEPT
    // methods (selectors starting with a colon).
    this.eq_list = [];
    // NOTE: For sensitivity analyses, equations are NOT outcomes, as all
    // SA outcomes must be specified explicitly.
    if(this.experiment !== SENSITIVITY_ANALYSIS.experiment) {
      const eml = Object.keys(MODEL.equations_dataset.modifiers);
      for(const em of eml) if(!em.startsWith(':')) this.eq_list.push(em);
    }
    const
        cv = this.experiment.variables.length,
        oc = this.oc_list.length,
        eq = this.eq_list.length,
        xr = [];
    if(cv) xr.push(pluralS(cv, 'variable'));
    if(oc) xr.push(pluralS(oc, 'outcome'));
    if(eq) xr.push(pluralS(eq, 'equation'));
    // NOTE: For long simulation periods, computing run results can take
    // a substantial amount of time. Hence it is performed using function
    // timeouts so that the browser can update the progress needle.
    UI.setMessage('Processing experiment run results: ' + xr.join(', '));
    UI.setProgressNeedle(0);
    this.steps = cv + oc + eq;
    // Keep track of progress.
    this.step = 0;
    this.addChartResults(0);
  }

  addChartResults(vi) {
    // Add a run result object for chart variable with index `vi`.
    if(vi < this.experiment.variables.length) {
      this.results.push(
          new ExperimentRunResult(this, this.experiment.variables[vi]));
      this.step++;
      UI.setProgressNeedle(this.step / this.steps);
      setTimeout((x) => x.addChartResults(vi + 1), 0, this);
    } else {
      this.addOutcomeResults(0);
    }
  }
  
  addOutcomeResults(oi) {
    // Add a run result object for outcome dataset with index `vi`.
    if(oi < this.oc_list.length) {
      // NOTE: This stores results only for "active" selectors (current run).
      this.results.push(new ExperimentRunResult(this, MODEL.outcomes[oi]));
      this.step++;
      UI.setProgressNeedle(this.step / this.steps, '#d00080');
      setTimeout((x) => x.addOutcomeResults(oi + 1), 0, this);
    } else {
      this.addEquationResults(0);
    }
  }

  addEquationResults(ei) {
    // Add a run result object for equation with index `ei`.
    if(ei < this.eq_list.length) {
      const k = this.eq_list[ei];
      // NOTE: Passing key `k` as 3rd parameter signals "use this attribute".
      this.results.push(
          new ExperimentRunResult(this, MODEL.equations_dataset, k));      
      this.step++;
      UI.setProgressNeedle(this.step / this.steps, '#2000d0');
      setTimeout((x) => x.addEquationResults(ei + 1), 0, this);
    } else {
      // Register when this result was stored.
      this.time_recorded = new Date().getTime();
      // Clear the progress needle.
      UI.setProgressNeedle(0);
      UI.setMessage('');
      // Log the time it took to compute all results.
      VM.logMessage(VM.block_count - 1,
          `Processing run results took ${VM.elapsedTime} seconds.`);
      // Report results if applicable.
      if(RECEIVER.solving || MODEL.report_results) RECEIVER.report();
      // NOTE: addResults is called by either the experiment manager or
      // the sensitivity analysis; hence proceed from there.
      if(SENSITIVITY_ANALYSIS.experiment) {
        SENSITIVITY_ANALYSIS.processRestOfRun();
      } else {
        EXPERIMENT_MANAGER.processRestOfRun();
      }
    }
  }
  
  addMessages() {
    // Store the message texts of the virtual machine (one per block) so that
    // they can be viewed when an experiment run is selected in the viewer.
    this.warning_count = 0;
    this.solver_seconds = 0;
    for(let b = 0; b < VM.messages.length; b++) {
      const bm = new BlockMessages();
      bm.block_number = b;
      bm.solver_time = VM.solver_times[b];
      bm.solver_secs = VM.solver_secs[b];
      bm.messages = VM.messages[b];
      this.block_messages.push(bm);
      this.warning_count += bm.warningCount;
      // NOTE: When set by the VM, `solver_secs` is a string.
      this.solver_seconds += parseFloat(bm.solver_secs);
    }
  }
  
  resetScaledVectors() {
    // Set the vectors with scaled run results to NULL so they will recompute. 
    for(const r of this.results) r.resetScaledVectors();
  }

} // END of class ExperimentRun


// CLASS Experiment
class Experiment {
  constructor(n) {
    this.title = n;
    this.comments = '';
    this.download_settings = {
        variables: 'selected',
        runs: 'selected',
        statistics: true,
        series: false,
        solver: false,
        separator: 'semicolon',
        quotes: 'none',
        precision: CONFIGURATION.results_precision
      };
    this.dimensions = [];
    this.charts = [];
    this.actual_dimensions = [];
    this.plot_dimensions = [];
    this.combinations = [];
    this.variables = [];
    this.configuration_dims = 0;
    this.column_scenario_dims = 0;
    this.iterator_ranges = [[0,0], [0,0], [0,0]];
    this.iterator_dimensions = [];
    this.settings_selectors = [];
    this.settings_dimensions = [];
    this.combination_selectors = [];
    this.combination_dimensions = [];
    this.available_dimensions = [];
    this.actor_selectors = [];
    this.actor_dimensions = [];
    this.excluded_selectors = '';
    this.clusters_to_ignore = [];
    this.runs = [];
    // NOTE: The properties below are NOT saved in model file, but persist
    // during a modeling session so that the modeler can switch between
    // experiments in the viewer without losing the viewer settings for this
    // experiment.
    this.reference_configuration = 0;
    this.selected_variable = '';
    this.selected_statistic = 'mean';
    this.selected_scale = 'val';
    this.selelected_color_scale = 'no';
    // Set of combination indices to be displayed in chart.
    this.chart_combinations = [];
    // String to store original model settings while executing experiment runs.
    this.original_model_settings = '';
    // NOTE: clearRuns adds some more properties -- see below.
    this.clearRuns();
  }
  
  clearRuns() {
    // NOTE: Separated from basic initialization so that it can be called
    // when the modeler clicks on the "Clear results" button.
    // @@TO DO: prepare for UNDO.
    this.runs.length = 0;
    this.single_run = -1;
    this.completed = false;
    this.time_started = 0;
    this.time_stopped = 0;
    this.active_combination_index = -1;
    this.chart_combinations.length = 0;
  }

  resetScaledVectors() {
    // Set the scaled results vectors to NULL for all runs.
    for(const r of this.runs) r.resetScaledVectors();
  }

  get type() {
    // Behave like an entity w.r.t. documentation.
    return 'Experiment';
  }
  
  get displayName() {
    // Behave like an entity w.r.t. documentation.
    return this.title;
  }
  
  get activeCombination() {
    // Return the list of active selectors.
    if(this.active_combination_index < 0) return [];
    return this.combinations[this.active_combination_index];
  }
  
  get iteratorRangeString() {
    // Return the iterator ranges as "from,to" pairs separated by |
    const ir = [];
    for(let i = 0; i < 3; i++) {
      ir.push(this.iterator_ranges[i].join(','));
    }
    return ir.join('|');
  }
  
  parseIteratorRangeString(s) {
    // Parse `s` as "from,to" pairs, ignoring syntax errors.
    if(s) {
      const ir = s.split('|');
      // Add 2 extra substrings to have at least 3.
      ir.push('', '');
      for(let i = 0; i < 3; i++) {
        const r = ir[i].split(',');
        // Likewise add extra substring to have at least 2.
        r.push('');
        // Parse integers, defaulting to 0.
        this.iterator_ranges[i] = [safeStrToInt(r[0], 0), safeStrToInt(r[1], 0)];
      }
    }
  }
  
  updateIteratorDimensions() {
    // Create iterator selectors for each index variable having a relevant range.
    this.iterator_dimensions = [];
    const il = ['i', 'j', 'k'];
    for(let i = 0; i < 3; i++) {
      const r = this.iterator_ranges[i];
      if(r[0] || r[1]) {
        const
            sel = [],
            k = il[i] + '=';
        // NOTE: Iterate from FROM to TO limit also when FROM > TO.
        if(r[0] <= r[1]) {
          for(let j = r[0]; j <= r[1]; j++) {
            sel.push(k + j);
          }
        } else {
          for(let j = r[0]; j >= r[1]; j--) {
            sel.push(k + j);
          }          
        }
        this.iterator_dimensions.push(sel);
      }
    }
  }
  
  matchingCombinationIndex(sl) {
    // Return the index of the run that can be inferred from selector list
    // `sl`, or FALSE if results for this run are not yet available.
    // NOTE: The selector list `sl` is a run specification that is *relative*
    // to the active combination of the *running* experiment, which may be
    // different from `this`. For example, consider an experiment with
    // three dimensions A = {a1, a2, a3), B = {b1, b2} and C = {c1, c2, c3},
    // and assume that the active combination is a2 + b2 + c2. Then the
    // "matching" combination will be:
    //  a2 + b2 + c2  if `sl` is empty
    //  a2 + b1 + c2  if `sl` is [b1]
    //  a1 + b3 + c2  if `sl` is [b3, a1]  (selector sequence)
    // NOTES:
    // (1) Elements of `sl` that are not element of A, B or C are ingnored.
    // (2) `sl` should not contain more than 1 selector from the same dimension.
    const
        valid = [],
        v_pos = {},
        matching = [];
    // First, retain only the (unique) valid selectors in `sl`.
    for(const s of sl) if(valid.indexOf(s) < 0) {
      for(const c of this.combinations) {
        // NOTE: Because of the way combinations are constructed, the index of
        // a valid selector in a combinations will always be the same.
        const pos = c.indexOf(s);
        // Conversely, when a new selector has the same position as a selector
        // that was already validated, this new selector is disregarded.
        if(pos >= 0 && !v_pos[pos]) {
          valid.push(s);
          v_pos[pos] = true;
        }
      }
    }
    // Then build a list of indices of combinations that match all valid selectors.
    // NOTE: The list of runs may not cover ALL combinations.
    for(let ri = 0; ri < this.runs.length; ri++) {
      if(intersection(valid, this.runs[ri].combination).length === valid.length) {
        matching.push(ri);
      }
    }
    // Results may already be conclusive:
    if(!matching.length) return false;
    // NOTE: If no experiment is running, there is no "active combination".
    // This should not occur, but in then return the last (= most recent) match. 
    if(matching.length === 1 || !MODEL.running_experiment) return matching.pop();
    // If not conclusive, find the matching combination that -- for the remaining
    // dimensions of the experiment -- has most selectors in common with
    // the active combination of the *running* experiment.
    const ac = MODEL.running_experiment.activeCombination;
    let high = 0,
        index = false;
    for(const ri of matching) {
      const c = this.runs[ri].combination;
      let nm = 0;
      // NOTE: Ignore the matching valid selectors.
      for(let ci = 0; ci < c.length; ci++) {
        if(!v_pos[ci] && ac.indexOf(c[ci]) >= 0) nm++;
      }
      // NOTE: Using >= ensures that index will be set even for 0 matching.
      if(nm >= high) {
        high = nm;
        index = ri;
      }
    }
    return index;
  }
  
  isDimensionSelector(s) {
    // Return TRUE if `s` is a dimension selector in this experiment.
    for(const dim of this.dimensions) if(dim.indexOf(s) >= 0) return true;
    if(this.settings_selectors.indexOf(s) >= 0) return true;
    if(this.combination_selectors.indexOf(s) >= 0) return true;
    if(this.actor_selectors.indexOf(s) >= 0) return true;
    return false;
  }
  
  get allDimensionSelectors() {
    // Return list of all dimension selectors in this experiment.
    const
        dict = MODEL.dictOfAllSelectors,
        dims = [];
    for(let s in dict) if(this.isDimensionSelector(s)) dims.push(s);
    return dims;
  }

  get asXML() {
    let d = '';
    for(const dim of this.dimensions) {
      d += `<dim>${xmlEncoded(dim.join(','))}</dim>`;
    }
    let ct = '';
    for(const c of this.charts) {
      ct += `<chart-title>${xmlEncoded(c.title)}</chart-title>`;
    }
    let ss = '';
    for(const sel of this.settings_selectors) {
      ss += `<ssel>${xmlEncoded(sel)}</ssel>`;
    }
    let sd = '';
    for(const s of this.settings_dimensions) {
      const dim = `<sdim>${xmlEncoded(s.join(','))}</sdim>`;
      if(sd.indexOf(dim) < 0) sd += dim;
    }
    let cs = '';
    for(const s of this.combination_selectors) {
      cs += `<csel>${xmlEncoded(s)}</csel>`;
    }
    let cd = '';
    for(const d of this.combination_dimensions) {
      const dim = `<cdim>${xmlEncoded(d.join(','))}</cdim>`;
      if(cd.indexOf(dim) < 0) cd += dim;
    }
    let as = '';
    for(const s of this.actor_selectors) as += s.asXML;
    let cti = '';
    for(const cs of this.clusters_to_ignore) {
      cti += '<cluster-to-ignore><cluster>' + xmlEncoded(cs.cluster.displayName) +
          '</cluster><selectors>' + xmlEncoded(cs.selectors) +
          '</selectors></cluster-to-ignore>';
    }
    let r = '';
    for(const run of this.runs) r += run.asXML;
    return ['<experiment configuration-dims="', this.configuration_dims,
      '" column_scenario-dims="', this.column_scenario_dims,
      (this.completed ? '" completed="1' : ''),
      '" iterator-ranges="', this.iteratorRangeString,
      '" started="', this.time_started,
      '" stopped="', this.time_stopped,
      '" variables="', this.download_settings.variables,
      '" runs="', this.download_settings.runs,
      '" statistics="', this.download_settings.statistics ? 1 : 0,
      '" series="', this.download_settings.series ? 1 : 0,
      '" solver="', this.download_settings.solver ? 1 : 0,
      '" separator="', this.download_settings.separator,
      '" quotes="', this.download_settings.quotes,
      '" precision="', this.download_settings.precision,
      '"><title>', xmlEncoded(this.title),
      '</title><notes>', xmlEncoded(this.comments),
      '</notes><dimensions>', d,
      '</dimensions><plot-dimensions>', this.plot_dimensions.join(','),
      '</plot-dimensions><chart-titles>', ct,
      '</chart-titles><settings-selectors>', ss,
      '</settings-selectors><settings-dimensions>', sd,
      '</settings-dimensions><combination-selectors>', cs,
      '</combination-selectors><combination-dimensions>', cd,
      '</combination-dimensions><actor-selectors>', as,
      '</actor-selectors><excluded-selectors>',
      xmlEncoded(this.excluded_selectors),
      '</excluded-selectors><clusters-to-ignore>', cti,
      '</clusters-to-ignore><runs>', r,
      '</runs></experiment>'].join('');
  }

  initFromXML(node) {
    this.configuration_dims = safeStrToInt(
      nodeParameterValue(node, 'configuration-dims'));
    this.column_scenario_dims = safeStrToInt(
      nodeParameterValue(node, 'column-scenario-dims'));
    this.parseIteratorRangeString(nodeParameterValue(node, 'iterator-ranges'));
    this.completed = nodeParameterValue(node, 'completed') === '1';
    this.time_started = safeStrToInt(nodeParameterValue(node, 'started'));
    this.time_stopped = safeStrToInt(nodeParameterValue(node, 'stopped'));
    // Restore last download dialog settings for this experiment.
    this.download_settings = {
        variables: nodeParameterValue(node, 'variables') || 'selected',
        runs: nodeParameterValue(node, 'runs') || 'selected',
        statistics: nodeParameterValue(node, 'statistics') !== '0',
        series: nodeParameterValue(node, 'series') === '1',
        solver: nodeParameterValue(node, 'solver') === '1',
        separator: nodeParameterValue(node, 'separator') || 'semicolon',
        quotes: nodeParameterValue(node, 'quotes') || 'none',
        precision: safeStrToInt(nodeParameterValue(node, 'precision'),
            CONFIGURATION.results_precision)
      };
    this.title = xmlDecoded(nodeContentByTag(node, 'title'));
    this.comments = xmlDecoded(nodeContentByTag(node, 'notes'));
    let n = childNodeByTag(node, 'dimensions');
    if(n) {
      for(const c of n.childNodes) if(c.nodeName === 'dim') {
        this.dimensions.push(xmlDecoded(nodeContent(c)).split(','));
      }
    }
    n = nodeContentByTag(node, 'plot-dimensions');
    if(n) {
      this.plot_dimensions = n.split(',');
      // NOTE: String parts must be converted to integers.
      for(let i = 0; i < this.plot_dimensions.length; i++) {
        this.plot_dimensions[i] = parseInt(this.plot_dimensions[i]);
      }
    }
    n = childNodeByTag(node, 'chart-titles');
    if(n) {
      for(const c of n.childNodes) if(c.nodeName === 'chart-title') {
        const ci = MODEL.indexOfChart(xmlDecoded(nodeContent(c)));
        // Double-check: only add existing charts.
        if(ci >= 0) this.charts.push(MODEL.charts[ci]);
      }
    }
    n = childNodeByTag(node, 'settings-selectors');
    if(n) {
      for(const c of n.childNodes) if(c.nodeName === 'ssel') {
        this.settings_selectors.push(xmlDecoded(nodeContent(c)));
      }
    }
    n = childNodeByTag(node, 'settings-dimensions');
    if(n) {
      for(const c of n.childNodes) if(c.nodeName === 'sdim') {
        this.settings_dimensions.push(xmlDecoded(nodeContent(c)).split(','));
      }
    }
    n = childNodeByTag(node, 'combination-selectors');
    if(n) {
      for(const c of n.childNodes) if(c.nodeName === 'csel') {
        this.combination_selectors.push(xmlDecoded(nodeContent(c)));
      }
    }
    n = childNodeByTag(node, 'combination-dimensions');
    if(n) {
      for(const c of n.childNodes) if(c.nodeName === 'cdim') {
        this.combination_dimensions.push(xmlDecoded(nodeContent(c)).split(','));
      }
    }
    n = childNodeByTag(node, 'actor-selectors');
    if(n) {
      for(const c of n.childNodes) if(c.nodeName === 'asel') {
        const as = new ActorSelector();
        as.initFromXML(c);
        this.actor_selectors.push(as);
      }
    }
    this.excluded_selectors = xmlDecoded(nodeContentByTag(node, 'excluded-selectors'));
    n = childNodeByTag(node, 'clusters-to-ignore');
    if(n) {
      for(const c of n.childNodes) if(c.nodeName === 'cluster-to-ignore') {
        const
          cdn = xmlDecoded(nodeContentByTag(c, 'cluster')),
          cl = MODEL.objectByName(cdn);
        if(cl) {
          this.clusters_to_ignore.push({cluster: cl,
              selectors: xmlDecoded(nodeContentByTag(c, 'selectors'))
            });
        } else {
          UI.warn(`Unknown cluster set to ignore: "${cdn}"`);
        }
      }
    }
    n = childNodeByTag(node, 'runs');
    if(n) {
      let r = 0;
      for(const c of n.childNodes) if(c.nodeName === 'experiment-run') {
        const xr = new ExperimentRun(this, r);
        xr.initFromXML(c);
        this.runs.push(xr);
        r++;
      }
    }
  }
  
  hasDimension(d) {
    // Return dimension index if any dimension contains any selector in
    // dimension `d`, or -1 otherwise.
    for(let index = 0; index < this.dimensions.length; index++) {
      const xd = this.dimensions[index].slice();
      this.expandCombinationSelectors(xd);
      if(intersection(xd, d).length > 0) return index;
    }
    return -1;
  }
  
  removeDimension(d) {
    // Remove dimension `d` from list and return its old index.
    for(let index = 0; index < this.dimensions.length; index++) {
      if(intersection(this.dimensions[index], d).length > 0) {
        this.dimensions.splice(index, 1);
        return index;
      }
    }
    return -1;
  }

  reduceDimension(d) {
    // Reduce dimension that includes `d` to just `d`, and return its old index.
    for(let index = 0; index < this.dimensions.length; index++) {
      const sl = intersection(this.dimensions[index], d);
      if(sl.length > 0) {
        this.dimensions[index] = sl;
        return index;
      }
    }
    return -1;
  }

  updateActorDimension() {
    // Remove actor dimension (if in the list).
    let adi = -1;
    if(this.actor_dimensions.length > 0) {
      adi = this.hasDimension(this.actor_dimensions[0]);
    }
    // Infer new actor dimension (all actor selectors).
    this.actor_dimensions.length = 0;
    if(this.actor_selectors.length > 0) {
      const d = [];
      for(const as of this.actor_selectors) d.push(as.selector);
      this.actor_dimensions.push(d);
      // If actor dimension was in dimension list, replace it by the new one.
      if(adi >= 0) this.dimensions[adi] = d;
    }
  }
  
  orthogonalSelectors(c) {
    // Return TRUE iff the selectors in set `c` all are elements of
    // different experiment dimensions.
    const
        // Make a copy of `c` so it can be safely expanded.
        xc = c.slice(),
        // Start with a copy of all model dimensions.
        dl = MODEL.dimensions.slice(),
        issues = [];
    // Add dimensions defined for this experiment.
    for(const d of this.settings_dimensions) dl.push(d);
    for(const d of this.actor_dimensions) dl.push(d);
    // Expand `c` as it may contain combination selectors.
    this.expandCombinationSelectors(xc);
    // Check for all these dimensions that `c` contains known selectors
    // and that no two or more selectors occur in the same dimension.
    let unknown = xc.slice();
    for(const d of dl) {
      const idc = intersection(d, xc);
      unknown = complement(unknown, idc);
      if(idc.length > 1) {
        const pair = idc.join(' & ');
        if(issues.indexOf(pair) < 0) issues.push(pair);
      }
    }
    if(unknown.length > 0) {
      UI.warn('Combination contains ' +
          pluralS(unknown.length, 'undefined selector') +
          ' (' + unknown.join(', ') + ')');
      return false;
    }
    if(issues.length > 0) {
      UI.warn('Combination contains multiple selectors from same dimension (' +
          issues.join(', ') + ')');
      return false;
    }
    return true;
  }
  
  expandCombinationSelectors(cs) {
    // Expansion of combination selectors in a selector set `cs` means
    // that if, for example, `cs` = (A, C1) where C1 is a combination
    // selector defined as C1 = (B, C2) with A and B being "normal"
    // selectors, then C1 must be removed from `cs`, while B and the
    // expansion of C2 must be appended to `cs`.
    // NOTE: The original selectors C1 and C2 must be removed because
    // *dimension* selectors cannot be a used as "normal" selectors
    // (e.g., for dataset modifiers, actor settings or model setting).
    // NOTE: Traverse `cs` in reverse order to ensure that deleting and
    // appending produce the intended result.
    for(let i = cs.length - 1; i >= 0; i--) {
      const s = cs[i];
      // Check whether selector `s` defines a combination.
      for(const sel of this.combination_selectors) {
        const tuple = sel.split('|');
        if(tuple[0] === s) {
          // First remove `s` from the original set...
          cs.splice(i, 1);
          // Let `xs` be the selector set to replace `s`.
          const xs = tuple[1].split(' ');
          // Recursively expand `xs`, as it may contain combination selectors.
          this.expandCombinationSelectors(xs);
          // ... and append its expansion
          cs.push(...xs);
        }
      }
    }
  }
  
  orthogonalCombinationDimensions(sl) {
    // Returns TRUE iff the expansions of the selectors in set `sl`
    // are mutually exclusive.
    const
        xl = {},
        issues = {};
    for(const s of sl) {
      xl[s] = [s];
      this.expandCombinationSelectors(xl[s]);
      issues[s] = [];
    }
    let ok = true;
    for(let i = 0; i < sl.length; i++) {
      const s1 = sl[i];
      for(let j = i + 1; j < sl.length; j++) {
        const
            s2 = sl[j],
            shared = intersection(xl[s1], xl[s2]);
        if(shared.length > 0) {
          issues[s1].push(`${s2}: ${shared.join(', ')}`);
          ok = false;
        }
      }
    }
    if(!ok) {
      const il = [];
      for(const s of sl) if(issues[s].length > 0) {
        il.push(`${s} (${issues[s].join('; ')})`);
      }
      UI.warn('Combination dimension is not orthogonal: ' + il.join(', '));
    }
    return ok;
  }
  
  inferAvailableDimensions() {
    // Create list of dimensions that are orthogonal to those already
    // selected for this experiment.
    this.available_dimensions.length = 0;
    // For efficiency, do not use hasDimension but expand the dimensions
    // that are already selected once, and define a lookup function that
    // checks for orthogonality.
    const
        axes = [],
        orthogonal = (d) => {
            for(const a of axes) {
              if(intersection(a, d).length > 0) return false;
            }
            return true;
          };
    for(let i = 0; i < this.dimensions.length; i++) {
      axes.push(this.dimensions[i].slice());
      this.expandCombinationSelectors(axes[i]);
    }
    for(const d of MODEL.dimensions) if(orthogonal(d)) {
      this.available_dimensions.push(d);
    }
    for(const d of this.settings_dimensions) if(orthogonal(d)) {
      this.available_dimensions.push(d);
    }
    for(const d of this.iterator_dimensions) if(orthogonal(d)) {
      this.available_dimensions.push(d);
    }
    for(const d of this.actor_dimensions) if(orthogonal(d)) {
      this.available_dimensions.push(d);
    }
    for(const d of this.combination_dimensions) {
      // NOTE: Combination dimensions must be expanded before checking...
      const xd = d.slice();
      this.expandCombinationSelectors(xd);
      // ... but the original combination dimension must be added.
      if(orthogonal(xd)) this.available_dimensions.push(d);
    }
  }
  
  inferActualDimensions() {
    // Creates list of dimensions without excluded selectors
    this.actual_dimensions.length = 0;
    const excsel = this.excluded_selectors.split(' ');
    for(const d of this.dimensions) {
      const dim = complement(d, excsel);
      if(dim.length > 0) this.actual_dimensions.push(dim);
    }
  }

  inferCombinations(n=0, s=[]) {
    // Recursive function that creates list of selector combinations.
    if(n == 0) this.combinations.length = 0;
    if(n >= this.actual_dimensions.length) {
      // NOTE: Do not push an empty selector list (can occur if no dimensions).
      if(s.length > 0) this.combinations.push(s);
      // NOTE: Combinations may include *dimension* selectors.
      // These then must be "expanded".
      this.expandCombinationSelectors(s);
      return;
    }
    // Always include dimension, even if it contains only 1 selector.
    for(const dim of this.actual_dimensions[n]) {
      const ss = s.slice();
      ss.push(dim);
      this.inferCombinations(n + 1, ss);
    }
  }
  
  renameSelectorInDimensions(olds, news) {
    // Update the combination dimensions that contain `olds`.
    for(const sd of this.settings_dimensions) {
      const si = sd.indexOf(olds);
      if(si >= 0) sd[si] = news;
    }
    for(let i = 0; i < this.combination_selectors.length; i++) {
      const
          c = this.combination_selectors[i].split('|'),
          sl = c[1].split(' '),
          si = sl.indexOf(olds);
      if(si >= 0) {
        sl[si] = news;
        c[1] = sl.join(' ');
        this.combination_selectors[i] = c.join('|');
      }
    }
  }

  mayBeIgnored(c) {
    // Return TRUE iff cluster `c` is on the list to be ignored.
    for(const cti of this.clusters_to_ignore) if(cti.cluster === c) return true;
    return false;
  }

  inferVariables() {
    // Create list of distinct variables in charts.
    this.variables.length = 0;
    for(const c of this.charts) {
      for(const cv of c.variables) {
        let new_name = true;
        for(const v of this.variables) if(cv.displayName === v.displayName) {
          new_name = false;
          break;
        }
        // Only add if if the variable name is new.
        if(new_name) this.variables.push(cv);
      }
    }
  }
  
  resultIndex(dn) {
    // Return index of result for chart variable or outcome dataset having
    // display name `dn` (or -1 if not found).
    if(this.variables.length === 0) this.inferVariables();
    for(let index = 0; index < this.variables.length; index++) {
      if(this.variables[index].displayName === dn) {
        return index;
      }
    }
    // NOTE: Variables are stored first, outcomes second, equations last,
    // *while numbering continues*, hence index is position in unsorted
    // variable list, or position in outcome list, where this method
    // takes into account that experiments store ONE modifier expression
    // per outcome, and ALL equations except methods.
    const oci = MODEL.outcomeNames.indexOf(dn);
    if(oci >= 0) return oci + this.variables.length;
    return -1;
  }

  differences(x) {
    // Return "dictionary" of differences, or NULL if none.
    const d = differences(this, x, UI.MC.EXPERIMENT_PROPS);
/*
    @@TO DO: add diffs for array properties:
    
    this.dimensions = [];
    this.charts = [];
    this.settings_selectors = [];
    this.settings_dimensions = [];
    this.actor_selectors = [];
    this.actor_dimensions = [];
*/
    if(Object.keys(d).length > 0) return d;
    return null;
  }

  get resultsAsCSV() {
    // Return results as specfied by the download settings.
    // NOTE: No runs => no results => return empty string.
    if(this.runs.length === 0) return '';
    const
        // Local function to convert number to string
        numval = (v, p) => {
            // Return 0 as single digit
            if(Math.abs(v) < VM.NEAR_ZERO) return '0';
            // Return empty string for undefined or exceptional values
            if(!v || v < VM.MINUS_INFINITY || v > VM.PLUS_INFINITY) return '';
            // Return other values as float with specified precision
            return v.toPrecision(p);
          },
        prec = this.download_settings.precision,
        allruns = this.download_settings.runs === 'all',
        sep = (this.download_settings.separator === 'tab' ? '\t' :
              (this.download_settings.separator === 'comma' ? ',' : ';')),
        quo = (this.download_settings.quotes === 'single' ? "'" :
              (this.download_settings.quotes === 'double' ? '"' : '')),
        vars = [],
        data = {
            nr: `${quo}Run number${quo}${sep}`,
            combi: `${quo}Selectors${quo}${sep}`,
            rsecs: `${quo}Run duration${quo}${sep}`,
            ssecs: `${quo}Solver time${quo}${sep}`,
            warnings: `${quo}Warnings${quo}${sep}`,
            variable: `${quo}Variable${quo}${sep}`,
            N: `${quo}N${quo}${sep}`,
            sum: `${quo}Sum${quo}${sep}`,
            mean: `${quo}Mean${quo}${sep}`,
            variance: `${quo}Variance${quo}${sep}`,
            minimum: `${quo}Minimum${quo}${sep}`,
            maximum: `${quo}Maximum${quo}${sep}`,
            NZ: `${quo}Non-zero${quo}${sep}`,
            last: `${quo}Last${quo}${sep}`,
            exceptions: `${quo}Exceptions${quo}${sep}`,
            run: []
          };
    for(let r = 0; r < this.combinations.length; r++) {
      if(r < this.runs.length &&
          (allruns || this.chart_combinations.indexOf(r) >= 0)) {
        data.run.push(r);
      }
    }
    let series_length = 0,
        // By default, assume all variables to be output.
        start = 0,
        stop = this.runs[0].results.length;
    if(this.download_settings.variables === 'selected') {
      // Only one variable.
      start = this.resultIndex(this.selected_variable);
      stop = start + 1;
    }
    for(const rnr of data.run) {
      const r = this.runs[rnr];
      data.nr += r.number;
      data.combi += quo + this.combinations[rnr].join('|') + quo;
      // Run duration in seconds.
      data.rsecs += numval((r.time_recorded - r.time_started) * 0.001, 4);
      data.ssecs += numval(r.solver_seconds, 4);
      data.warnings += r.warning_count;
      for(let vi = start; vi < stop; vi++) {
        // Add empty cells for run attributes
        data.nr += sep;
        data.combi += sep;
        data.rsecs += sep;
        data.ssecs += sep;
        data.warnings += sep;
        const rr = r.results[vi];
        if(rr) {
          data.variable += rr.displayName + sep;
          // Series may differ in length; the longest determines the
          // number of rows of series data to be added.
          series_length = Math.max(series_length, rr.vector.length);
          if(this.download_settings.statistics) {
            data.N += rr.N + sep;
            data.sum += numval(rr.sum, prec) + sep;
            data.mean += numval(rr.mean, prec) + sep;
            data.variance += numval(rr.variance, prec) + sep;
            data.minimum += numval(rr.minimum, prec) + sep;
            data.maximum += numval(rr.maximum, prec) + sep;
            data.NZ += rr.non_zero_tally + sep;
            data.last += numval(rr.last, prec) + sep;
            data.exceptions += rr.exceptions + sep;
          }
        } else {
          console.log('No run results for ', this.variables[vars[vi]].displayName);
        }
      }
    }
    const ds = [data.nr, data.combi];
    if(this.download_settings.solver) {
      ds.push(data.rsecs, data.ssecs, data.warnings);
    }
    // Always add the row with variable names.
    ds.push(data.variable);
    if(this.download_settings.statistics) {
      ds.push(data.N, data.sum, data.mean, data.variance, data.minimum,
          data.maximum, data.NZ, data.last, data.exceptions);
    }
    if(this.download_settings.series) {
      ds.push('t');
      const row = [];
      for(let t = 0; t < series_length; t++) {
        row.length = 0;
        row.push(t);
        for(const rnr of data.run) {
          for(let vi = start; vi < stop; vi++) {
            const rr = this.runs[rnr].results[vi];
            if(rr) {
              // NOTE: Only experiment variables have vector data.
              if(rr.x_variable && t <= rr.N) {
                row.push(numval(rr.vector[t], prec));
              } else {
                row.push('');
              }
            }
          }
        }
        ds.push(row.join(sep));
      }
    }
    return ds.join('\n');
  }
  
} // END of CLASS Experiment


// CLASS BoundlineSelector
class BoundlineSelector {
  constructor(boundline, selector, x='', g=false) {
    this.boundline = boundline;
    this.selector = selector;
    this.expression = new Expression(boundline, selector, x);
    this.grouping = g;
  }
  
  get asXML() {
    // Prevent saving unidentified selectors.
    if(this.selector.trim().length === 0) return '';
    return ['<boundline-selector', (this.grouping ? ' points-x="1"' : ''),
      '><selector>', xmlEncoded(this.selector),
      '</selector><expression>', xmlEncoded(this.expression.text),
      '</expression></boundline-selector>'].join('');
  }

  initFromXML(node) {
    this.grouping = nodeParameterValue(node, 'points-x') === '1';
    this.expression.text = xmlDecoded(nodeContentByTag(node, 'expression'));
    if(IO_CONTEXT) {
      // Contextualize the included expression.
      IO_CONTEXT.rewrite(this.expression);
    }
  }

} // END of class BoundlineSelector


// CLASS BoundLine
class BoundLine {
  constructor(c) {
    this.constraint = c;
    // Default bound line imposes no constraint: Y >= 0 for all X.
    this.points = [[0, 0], [100, 0]];
    this.storePoints();
    this.type = VM.GE;
    // SVG string for contour of this bound line (to reduce computation).
    this.contour_path = '';
    this.point_data = [];
    this.url = '';
    this.selectors = [];
    this.selectors.push(new BoundlineSelector(this, '(default)', '0'));
  }
  
  get displayName() {
    return this.constraint.displayName + ' [' +
        VM.constraint_codes[this.type] + '] bound line #' +
        this.constraint.bound_lines.indexOf(this);
  }
  
  get name() {
    return this.displayName;
  }

  get copy() {
    // Return a "clone" of this bound line.
    let bl = new BoundLine(this.constraint);
    bl.points_string = this.points_string;
    // NOTE: Reset boundline to its initial "as edited" state.
    bl.restorePoints();
    bl.type = this.type;
    bl.contour_path = this.contour_path;
    bl.url = this.url;
    bl.point_data.length = 0;
    for(const pd of this.point_data) bl.point_data.push(pd.slice());
    bl.selectors.length = 0;
    for(const s of this.selectors) {
      bl.selectors.push(new BoundlineSelector(s.boundline, s.selector,
          s.expression.text, s.grouping));
    }
    return bl;
  }
  
  get staticLine() {
    // Return TRUE if bound line has only the default selector, and this
    // evaluates as default index = 0.
    return this.selectors.length < 2 &&
        this.selectors[0].expression.text === '0';
  }
  
  get selectorList() {
    // Return list of selector names only.
    const sl = [];
    for(const sel of this.selectors) sl.push(sel.selector);
    return sl;
  }

  selectorByName(name) {
    // Return selector having name `name`, or NULL if not found.
    for(const sel of this.selectors) if(sel.selector === name) return sel;
    return null;
  }
  
  addSelector(name, x='') {
    // Add selector if new, and return the named selector.
    const s = this.selectorByName(name);
    if(s) return s;
    name = MODEL.validSelector(name);
    if(name.indexOf('*') >= 0 || name.indexOf('?') >= 0) {
      UI.warn('Bound line selector cannot contain wildcards');
      return null;
    }
    if(name) {
      const s = new BoundlineSelector(this, name, x);
      this.selectors.push(s);
      this.selectors.sort((a, b) => compareSelectors(a.selector, b.selector));
      return s;
    }
    return null;
  }

  setPointsFromData(index) {
    // Get point coordinates from bound line series data at index.
    if(index > 0 && index <= this.point_data.length) {
      const pd = this.point_data[index - 1];
      this.points.length = 0;
      for(let i = 0; i < pd.length; i += 2) {
        this.points.push([pd[i] * 100, pd[i + 1] * 100]);
      }
    } else {
      // Data is seen as 1-based array => default to original coordinates.
      this.restorePoints();
    }
  }
  
  get activeSelectorIndex() {
    // Return the number of the first boundline selector that matches the
    // selector combination of the current experiment. Defaults to 0.
    if(this.selectors.length < 2) return 0;
    const x = MODEL.running_experiment;
    if(!x) return 0;
    for(let i = 1; i < this.selectors.length; i++) {
      if(x.activeCombination.indexOf(this.selectors[i].selector) >= 0) {
        return i;
      }
    }
    return 0;
  }
  
  setDynamicPoints(t, draw=false) {
    // Adapt bound line point coordinates for the current time step
    // for the running experiment (if any).
    // NOTE: For speed, first perform the quick check whether this line
    // is static, as then the points do not change.
    if(this.staticLine) return;
    const
        bls = this.selectors[this.activeSelectorIndex],
        r = bls.expression.result(t);
    // Log errors on the console, but ignore them.
    if(r <= VM.ERROR || r >= VM.EXCEPTION) {
      console.log('ERROR: Exception in boundline selector expression', bls, r);
    // NOTE: Double-check whether result is a grouping.
    } else if(bls.grouping || Array.isArray(r)) {
      this.validatePoints(r);
      this.points.length = 0;
      for(let i = 0; i < r.length; i += 2) {
        this.points.push([r[i] * 100, r[i + 1] * 100]);
      }
    } else {
      // NOTE: Data is not a time series but "array type" data. The time
      // step co-determines the result. If modelers provide time series
      // data, then they shoud use `t` (absolute time) as index expression,
      // otherwise `rt` (relative time).
      // NOTE: Result is a floating point number, so truncate it to integer.
      this.setPointsFromData(Math.floor(r));
    }
    // Compute and store SVG for thumbnail only when needed.
    if(draw) CONSTRAINT_EDITOR.setContourPath(this);
  }
  
  restorePoints() {
    // Restore point coordinates from original string.
    this.points = JSON.parse(this.points_string);
  }
  
  storePoints() {
    // Set point coordinates to be the original string.
    this.points_string = JSON.stringify(this.points);
  }
  
  get pointsDataString() {
    // Return point coordinates in data format (semicolon-separated numbers).
    const pd = [];
    for(const p of this.points) pd.push(p[0], p[1]);
    return pd.join(';');
  }

  get maxPoints() {
    // Return the highest number of points that this boundline can have.
    this.restorePoints();
    let n = this.points.length;
    for(const pd of this.point_data) n = Math.max(n, pd.length);
    const bls = this.selectors[this.activeSelectorIndex];
    if(bls.grouping) {
      const x = bls.expression;
      if(x.isStatic) {
        n = Math.max(n, x.result(1).length);
      } else {
        // For dynamic expressions, the grouping length may vary, so
        // we must check for the complete run length.
        for(let t = MODEL.start_period; t <= MODEL.end_period; t++) {
          n = Math.max(n, x.result(t).length);
        }
      }
    }
    return n;
  }

  validatePoints(pd) {
    if(!Array.isArray(pd)) {
      console.log(pd); throw "Not an array";
    }
    // Ensure that array `pd` is a valid series of point coordinates.
    if(pd.length) {
      // Ensure that number of point coordinates is even (Y defaults to 0).
      if(pd.length % 2) pd.push(0);
      // Ensure that bound line has at least 2 points.
      if(pd.length === 2) pd.push(1, 0);
    } else {
      // Default to horizontal line Y = 0.
      pd.push(0, 0, 1, 0);
    }
    // NOTE: Point coordinates must lie between 0 and 1, and for the
    // X-coordinates, it should hold that X[0] = 0, X[i+1] >= X[i],
    // and X[N] = 1.
    if(pd[0] !== 0) pd[0] = 0;
    if(pd[pd.length - 2] !== 1) pd[pd.length - 2] = 1;
    let min = 0,
        last = 2;
    for(let i = 1; i < pd.length; i++) {
      const x = 1 - i % 2;
      pd[i] = Math.min(1, Math.max(x ? min : 0, pd[i]));
      if(x) {
        // Keep track of first point having X = 1, as this should be the
        // last point of the boundline.
        if(pd[i] > min) last = i + 1;
        min = pd[i];
      }
    }
    // Truncate any points after the first point having X = 1.
    pd.lengh = last;
  }
  
  get pointDataString() {
    // Point data is stored as separate lines of semicolon-separated
    // floating point numbers, with N-digit precision to keep model files
    // compact (default: N = 8)
    let d = [];
    for(const opd of this.point_data) {
      const pd = [];
      for(const v of opd) {
        // Convert number to string with the desired precision.
        const f = v.toPrecision(CONFIGURATION.dataset_precision);
        // Then parse it again, so that the number will be represented
        // (by JavaScript) in the most compact representation.
        pd.push(parseFloat(f));
      }
      this.validatePoints(pd);
      // Push point coordinates as space-separated string.
      d.push(pd.join(';'));
    }
    return d.join('\n');
  }
  
  unpackPointDataString(str) {
    // Convert separate lines of semicolon-separated point data to a
    // list of lists of numbers.
    this.point_data.length = 0;
    str= str.trim();
    if(str) {
      for(const l of str.split('\n')) {
        const pd = [];
        for(const n of l.split(';')) pd.push(parseFloat(n.trim()));
        this.validatePoints(pd);
        this.point_data.push(pd);
      }
    }
  }

  get asXML() {
    // NOTE: Save boundline always with points-as-last-edited.
    this.restorePoints();
    const xml = ['<bound-line type="', this.type,
        '"><points>', JSON.stringify(this.points),
        '</points><contour>', this.contour_path,
        '</contour><url>', xmlEncoded(this.url),
        '</url><point-data>', xmlEncoded(this.pointDataString),
        '</point-data><selectors>'];
    for(const sel of this.selectors) xml.push(sel.asXML);
    xml.push('</selectors></bound-line>');
    return xml.join('');
  }
  
  initFromXML(node) {
    this.type = safeStrToInt(nodeParameterValue(node, 'type'), VM.EQ);
    this.points_string = nodeContentByTag(node, 'points');
    this.restorePoints();
    this.contour_path = nodeContentByTag(node, 'contour');
    this.url = xmlDecoded(nodeContentByTag(node, 'url'));
    if(this.url) {
      FILE_MANAGER.getRemoteData(this, this.url);
    } else {
      this.unpackPointDataString(
          xmlDecoded(nodeContentByTag(node, 'point-data')));
    }
    const n = childNodeByTag(node, 'selectors');
    if(n.length) {
      // NOTE: Only overwrite default selector if XML specifies selectors.
      this.selectors.length = 0;
      for(const c of n.childNodes) if(c.nodeName === 'boundline-selector') {
        const
            s = xmlDecoded(nodeContentByTag(c, 'selector')),
            bls = new BoundlineSelector(this, s);
        bls.initFromXML(c);
        this.selectors.push(bls);
      }
    }
  }
  
  get needsNoSOS() {
    // Return 1 if boundline is of type >= and line segments have an
    // increasing slope, -1 if boundline is of type <= and line segments
    // have a decreasing slope, and otherwise 0 (FALSE). If non-zero (TRUE),
    // the constraint can be implemented without the SOS2 constraint that
    // only two consecutive SOS variables may be non-zero.
    if(this.type === VM.EQ) return 0;
    if(this.type !== VM.LE) {
      let slope = 0,
          pp = this.points[0];
      for(let i = 1; i < this.points.length; i++) {
        const
            p = this.points[i],
            dx = p[0] - pp[0],
            s = (dx <= VM.NEAR_ZERO ? VM.PLUS_INFINITY : (p[1] - pp[1]) / dx);
        // Decreasing slope => not convex.
        if(s < slope) return 0;
        slope = s;
      }
      return 1;
    } else if (this.type !== VM.GE) {
      let slope = VM.PLUS_INFINITY,
          pp = this.points[0];
      for(let i = 1; i < this.points.length; i++) {
        const
            p = this.points[i],
            dx = p[0] - pp[0],
            s = (dx <= VM.NEAR_ZERO ? VM.PLUS_INFINITY : (p[1] - pp[1]) / dx);
        // Increasing slope => not convex.
        if(s > slope) return 0;
        slope = s;
      }
      return -1;
    }
    // Fall-through (should not occur).
    return 0;
  }
  
  get constrainsY() {
    // Return TRUE if this bound line constrains Y in some way.
    if(this.type === VM.EQ) return true;
    for(const p of this.points) {
      // LE bound line constrains when not at 100%, GE when not at 0%.
      if(this.type === VM.LE && p[1] < 100 || this.type === VM.GE && p[1] > 0) {
        return true;
      }
    }
    return false;
  }
  
  pointOnLine(x, y) {
    // Return TRUE iff (x, y) lies on this bound line (+/- 0.001%)
    // or within radius < tolerance from a point.
    const
        tol = 0.001,
        tolsq = tol * tol;
    for(let i = 0; i < this.points.length; i++) {
      const
          p = this.points[i],
          dsq = Math.pow(p[0] - x, 2) + Math.pow(p[1] - y, 2);
      if(dsq < tolsq) {
        return true;
      } else if(i > 0) {
        const pp = this.points[i - 1];
        if(x > pp[0] - 1 && x < p[0] + 1 &&
            ((y > pp[1] - tol && y < p[1] + tol) ||
             (y < pp[1] + tol && y > p[1] + tol))) {
          // Cursor lies within rectangle around line segment.
          const
              dx = p[0] - pp[0],
              dy = p[1] - pp[1];
          if(Math.abs(dx) < tol || Math.abs(dy) < tol) {
            // Special case: (near) vertical or (near) horizontal line.
            return true;
          } else {
            // Compute horizontal & vertical distance to line segment.
            const
                // H & V distance from left-most point.
                dpx = x - pp[0],
                dpy = y - pp[1],
                // Projected X, given Y-distance.
                nx = pp[0] + dpy * dx / dy,
                // Projected Y, given X-distance.
                ny = pp[1] + dpx * dy / dx,
                // Take absolute differences.
                dxol = Math.abs(nx - x),
                dyol = Math.abs(ny - y);
            // Only test the shortest distance.
            if (Math.min(dxol, dyol) < tol) {
              return true;
            }
          }
        }
      }
    }
    return false;
  }

}  // END of class BoundLine


// CLASS Constraint
// A constraint A ---> B defines a "feasible region" for the levels of A and B
// by means of a set of piece-wise linear bound lines Y = f(X) where X = 0
// corresponds to the lower bound of A, X = 100 to the upper bound of A, and
// likewise Y denotes the "percent range" of B.
// "No constraint" entails that A and B can take on any value between their
// bounds regardless of the level of the other. This is the initial state of a
// constraint, represented by a horizontal LOWER bound line from (0,0) to
// (100, 0). As the feasible area lies ABOVE this line, this leaves the
// entire 100x100 area "open.
// The modeler restricts the feasible area by moving the points on a bound line
// and/or by adding additional bound lines.
// A constraint translates to MILP equations that encode the piecewise linear
// function usins a special ordered set of type 2 -- see setupProblem() in file
// linny-r-vm.js
// NOTES:
// (1) In the above example, A is the FROM node, and B the TO node
// (2) NO upward compatibility with "dynamic bounds" or "linked processes" in
//     legacy Linny-R, nor with constraints in Linny-R JS below version 1.10
//     (a warning message appears when such constraints are ignored)
class Constraint {
  constructor(from, to) {
    this.comments = '';
    this.from_node = from;
    this.to_node = to;
    // Dynamic bounds are defined by bound lines; default is a lower bound line
    // Y >= 0 (for any X)
    this.bound_lines = [new BoundLine(this)];
    // Modeler can opt to add no slack to the bound line equations
    this.no_slack = false;
    // Constraints X --> Y  between two processes can transfer (part of)
    // the cost of one process to the cost of the other process.
    this.soc_direction = VM.SOC_X_Y;
    this.share_of_cost = 0;
    // Constraints can be selected by clicking on the (curved, dashed) arrow
    // that represents them, or on the thumbnail in the middle of this arrow
    this.selected = false;
    // For drawing, a constraint has its own shape (mouse responsive)
    this.shape = UI.createShape(this);
    // The midpoint on the curve where the graph thumbnail will be displayed
    // NOTE: if one of this constraints nodes is NOT visible in the focal 
    // cluster, `mid_point` will be at the top of the other (hence visible)
    // node
    this.mid_point = null;
    // The following properties are used when drawing the arrow for
    // this constraint; they are calculated by the method
    // `setConstraintOffsets` of class Node
    this.top_x = 0;
    this.top_y = 0;
    this.bottom_x = 0;
    this.bottom_y = 0;
    this.from_offset = 0;
    this.to_offset = 0;
    this.reset();
  }
  
  reset() {
    // Reset run-dependent properties.
    for(const bl of this.bound_lines) bl.current = -1;
    // Slack information is a "sparse vector" that is filled after solving.
    this.slack_info = {};
  }
  
  get type() {
    return 'Constraint';
  }

  get typeLetter() {
    return 'B';
  }

  get identifier() {
    // NOTE: Constraint IDs are based on the node codes rather than IDs,
    // as this prevents problems when nodes are renamed. To ensure ID
    // uniqueness, constraints have FOUR underscores between node IDs
    // (links have three).
    return this.from_node.code + '____' + this.to_node.code;
  }
  
  get displayName() {
    return this.from_node.displayName + UI.CONSTRAINT_ARROW +
        this.to_node.displayName;
  }

  get attributes() {
    // NOTE: This requires some thought, still!
    const a = {name: this.displayName};
    if(MODEL.infer_cost_prices) {
      a.SOC = this.share_of_cost * this.soc_direction;
    }
    // @@ TO DO!!
    return a;
  }

  get defaultAttribute() {
    return 'A';
  }

  attributeValue(a) {
    // Return the computed result for attribute `a`: for constraints,
    // only A (active) and SOC (share of cost).
    if(a === 'A') return this.activeVector; // Binary vector - see below.
    // NOTE: Negative share indicates Y->X direction of cost sharing.
    if(a === 'SOC') return this.share_of_cost * this.soc_direction;
    return null;
  }
  
  get setsEquality() {
    // Return TRUE iff this constraint has an EQ bound line.
    for(const bl of this.bound_lines) if(bl.type === VM.EQ) return true;
    return false;
  }
  
  active(t) {
    // Return 1 if (X, Y) is on the bound line AND Y is not on its own
    // bounds, otherwise 0.
    if(!MODEL.solved) return 0;
    const
        fn = this.from_node,
        tn = this.to_node;
    let lbx = fn.lower_bound.result(t),
        lby = tn.lower_bound.result(t);
    // NOTE: LB of semi-continuous processes is 0 if LB > 0.
    if(lbx > 0 && fn instanceof Process & fn.level_to_zero) lbx = 0;
    if(lby > 0 && tn instanceof Process & tn.level_to_zero) lby = 0;
    const
        rx = fn.upper_bound.result(t) - lbx,
        ry = tn.upper_bound.result(t) - lby;
    // Prevent division by zero: when either range is 0, the constraint
    // must be active.
    if(rx < VM.NEAR_ZERO || ry < VM.NEAR_ZERO) return 1;
    // Otherwise, convert levels to % of range...
    const
        x = (fn.level[t] - lbx) / rx * 100,
        y = (tn.level[t] - lby) / ry * 100;
    // ... and then check whether (%X, %Y) lies on the bound line.
    for(const bl of this.bound_lines) {
      // Bound line does NOT constrain when Y is on its own bound.
      if((bl.type === VM.LE && Math.abs(y - 100) < VM.NEAR_ZERO) ||
          (bl.type === VM.GE && Math.abs(y) < VM.NEAR_ZERO)) continue;
      // Actualize bound line points for current time step.
      bl.setDynamicPoints(t);
      if(bl.pointOnLine(x, y)) return 1;
    }
    return 0;
  }
  
  get activeVector() {
    // Return active state for all time steps in the optimization period.
    const v = [];
    for(let t = 0; t < MODEL.runLength + 1; t++) v.push(this.active(t));
    return v;
  }

  get asXML() {
    let fn = this.from_node.name,
        tn = this.to_node.name,
        cmnts = xmlEncoded(this.comments);
    const
        fid = UI.nameToID(fn +
            (this.from_node.hasActor ? ` (${this.from_node.actor.name})` : '')),
        tid = UI.nameToID(tn +
            (this.to_node.hasActor ? ` (${this.to_node.actor.name})` : ''));
    // NOTE: "black-boxed" constraints are saved anonymously without comments
    if(MODEL.black_box_entities.hasOwnProperty(fid)) {
      fn = MODEL.black_box_entities[fid];
      cmnts = '';
    }
    if(MODEL.black_box_entities.hasOwnProperty(tid)) {
      tn = MODEL.black_box_entities[tid];
      cmnts = '';
    }
    let xml = ['<constraint', (this.no_slack ? ' no-slack="1"' : ''),
      ' soc-direction="', this.soc_direction,
      '"><from-name>',  xmlEncoded(this.from_node.name),
      '</from-name><from-owner>', xmlEncoded(this.from_node.actor.name),
      '</from-owner><to-name>', xmlEncoded(this.to_node.name),
      '</to-name><to-owner>', xmlEncoded(this.to_node.actor.name),
      '</to-owner><bound-lines>'].join('');
    for(const bl of this.bound_lines) xml += bl.asXML;
    return xml + '</bound-lines><share-of-cost>' + this.share_of_cost +
      '</share-of-cost><notes>' + cmnts + '</notes></constraint>';
  }

  initFromXML(node) {
    // NOTE: from and to nodes are set by the constructor
    this.no_slack = nodeParameterValue(node, 'no-slack') === '1';
    // NOTE: SoC direction defaults to 1 (X->Y) if not specified
    this.soc_direction = safeStrToInt(
        nodeParameterValue(node, 'soc-direction'), 1);
    const n = childNodeByTag(node, 'bound-lines');
    if(n) {
      // NOTE: only overwrite default lines if XML specifies bound lines
      this.bound_lines.length = 0;
      for(const c of n.childNodes) if(c.nodeName === 'bound-line') {
        const bl = new BoundLine(this);
        bl.initFromXML(c);
        this.bound_lines.push(bl);
      }
    }
    this.share_of_cost = safeStrToFloat(
        nodeContentByTag(node, 'share-of-cost'), 0);
    this.comments = xmlDecoded(nodeContentByTag(node, 'notes'));
    if(IO_CONTEXT) {
      // Record that this constraint was included
      IO_CONTEXT.addedLink(this);
    }
  }

  get copy() {
    // Returns a new constraint instance with the same properties as this one
    // NOTE: such copies should NOT be added to the model's constraint list,
    // as constraints are uniquely identified by ther FROM and TO nodes
    const c = new Constraint(this.from_node, this.to_node);
    c.copyPropertiesFrom(this);
    return c;
  }

  copyPropertiesFrom(c) {
    // Clear the current bound lines (if any)
    this.bound_lines.length = 0;
    // NOTE: use the GET property "copy", NOT the Javascript function copy() !! 
    for(const l of c.bound_lines) {
      const bl = l.copy;
      // Take "ownership" of this bound line copy
      bl.constraint = this;
      this.bound_lines.push(bl);
    }
    this.no_slack = c.no_slack;
    this.soc_direction = c.soc_direction;
    this.share_of_cost = c.share_of_cost;
    this.comments = c.comments;
  }

  differences(c) {
    // Return "dictionary" of differences, or NULL if none
    const d = differences(this, c, UI.MC.CONSTRAINT_PROPS);
    // @@TO DO: add bound line diffs
    if(Object.keys(d).length > 0) return d;
    return null;
  }

  get visibleNodes() {
    // Return tuple [from, to] where TRUE indicates that this node is
    // visible in the focal cluster.
    const
        fc = MODEL.focal_cluster,
        fv = (this.from_node instanceof Process ?
            this.from_node.cluster === fc :
            fc.indexOfProduct(this.from_node) >= 0),
        tv = (this.to_node instanceof Process ?
            this.to_node.cluster === fc :
            fc.indexOfProduct(this.to_node) >= 0);
    return [fv, tv];
  }
  
  get hasArrow() {
    // Return TRUE if both nodes are visible.
    const vn = this.visibleNodes;
    return vn[0] && vn[1];
  }

  get baseLine() {
    // Return the "base" bound line Y >= 0 (for any X) if it exists.
    for(const bl of this.bound_lines) {
      const p = bl.points;
      if(bl.type === VM.GE && p.length === 2 &&
          p[0][0] ===   0 && p[0][1] === 0 &&
          p[1][0] === 100 && p[1][1] === 0 ) return bl;
    }
    return null;
  }
  
  addBoundLine() {
    // Add a new bound line to this constraint, and returns this new line.
    // NOTE: Return the "base" bound line Y >= 0 (for any X) if it already
    //       exists and has no associated dataset.
    let bl = this.baseLine;
    if(bl && bl.point_data.length === 0) return bl;
    bl = new BoundLine(this);
    this.bound_lines.push(bl);
    return bl;
  }
  
  deleteBoundLine(bl) {
    // Remove a boundline from this constraint.
    if(!bl) return;
    const bi = this.bound_lines.indexOf(bl);
    if(bi >= 0) {
      // Remove this one line from the list.
      this.bound_lines.splice(bi, 1);
      if(this.bound_lines.length === 0) {
        // NOTE: Constraint must have at least one boundline.
        this.bound_lines.push(new BoundLine(this));
      }
    }
  }
  
  containsPoint(x, y) {
    // Return TRUE if the point (x, y) lies within the 12x12 thumbnail
    // chart area of this constraint (either in the middle of the curved
    // arrow or at the top of its one visible node)
    return this.midpoint && Math.abs(x - this.midpoint[0]) <= 6 &&
        Math.abs(y - this.midpoint[1]) <= 6;
  }
  
} // END of class Constraint

///////////////////////////////////////////////////////////////////////
// Define exports so that this file can also be included as a module //
///////////////////////////////////////////////////////////////////////

if(NODE) module.exports = {
  LinnyRModel: LinnyRModel,
  ModelParameter: ModelParameter,
  Import: Import,
  Export: Export,
  IOBinding: IOBinding,
  IOContext: IOContext,
  Actor: Actor,
  ObjectWithXYWH: ObjectWithXYWH,
  NoteField: NoteField,
  Note: Note,
  NodeBox: NodeBox,
  Arrow: Arrow,
  Cluster: Cluster,
  Node: Node,
  Process: Process,
  Product: Product,
  ProductPosition: ProductPosition,
  Link: Link,
  DatasetModifier: DatasetModifier,
  Dataset: Dataset,
  ChartVariable: ChartVariable,
  Chart: Chart,
  ColorScale: ColorScale,
  ActorSelector: ActorSelector,
  ExperimentRunResult: ExperimentRunResult,
  BlockMessages: BlockMessages,
  ExperimentRun: ExperimentRun,
  Experiment: Experiment,
  BoundlineSelector: BoundlineSelector,
  BoundLine: BoundLine,
  Constraint: Constraint
};
