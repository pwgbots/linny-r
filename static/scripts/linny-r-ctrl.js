/*
Linny-R is an executable graphical specification language for (mixed integer)
linear programming (MILP) problems, especially unit commitment problems (UCP).
The Linny-R language and tool have been developed by Pieter Bots at Delft
University of Technology, starting in 2009. The project to develop a browser-
based version started in 2017. See https://linny-r.org for more information.

This JavaScript file (linny-r-ctrl.js) provides the basic controllers to
run a Linny-R model without its browser-based GUI. The classes defined in this
file all have their graphical extensions in file linny-r-gui.js.

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

class Controller {
  constructor() {
    this.console = true;
    this.browser_name = '';
    // Initialize *graphical* controller elements as non-existent 
    this.paper = null;
    this.buttons = {};
    this.modals = {};
    this.dialogs = {};
    // Default chart colors (12 line colors + 12 matching lighter shades)
    this.chart_colors = [
        '#2e86de', '#ff9f43', '#8395a7', '#10ac84', '#f368e0', 
        '#0abde3', '#ee5253', '#222f3e', '#01a3a4', '#341f97',
        '#974b33', '#999751',
        // Lighter shades for areas (or additional lines if > 10)
        '#54a0ff', '#feca57', '#c8d6e5', '#1dd1a1', '#ff9ff3',
        '#48dbfb', '#ff6b6b', '#576574', '#00d2d3', '#5f27cd',
        '#c86a5b', '#c2c18c'
      ];
    // SVG stroke dash arrays for line types while drawing charts or arrows
    this.sda = {
      dash: '8,3',
      dot: '2,3',
      dash_dot: '7,3,2,3',
      long_dash: '12,3',
      longer_dash: '15,3', 
      short_dash: '5,2',
      shorter_dash: '0.5,2.5',
      long_dash_dot: '10,3,2,3',
      even_dash: '6,5',
      dot_dot: '2,3,2,6'
    };
    // Error messages
    this.ERROR = {
        CREATE_FAILED: 'ERROR: failed to create a new SVG element',
        APPEND_FAILED: 'ERROR: failed to append SVG element to DOM',
        NO_DATASET_DOT: '"." only makes sense in dataset modifier expressions',
        NO_NUMBER_CONTEXT: 'Number # is undefined in this context'
      };
    this.WARNING = {
        NO_CONNECTION: 'No connection with server',
        INVALID_ACTOR_NAME: 'Invalid actor name',
        SELECTOR_SYNTAX: 'Selector can contain only letters, digits, +, -, % and wildcards',
        SINGLE_WILDCARD: 'Selector can contain only one *',
        INVALID_SELECTOR: 'Invalid selector'
      };
    this.NOTICE = {
        WORK_IN_PROGRESS: 'Planned feature -- work in progress!',
        NO_CHARTS: 'While an experiment is running, charts cannot be viewed'
      };
    // Strings used to identify special entities
    this.TOP_CLUSTER_NAME = '(top cluster)';
    // In earlier versions, this name was different => automatic conversion
    this.FORMER_TOP_CLUSTER_NAME = '___TOP_CLUSTER___';
    // In legacy Linny-R, this name was again different
    this.LEGACY_TOP_CLUSTER_NAME = '* TOP CLUSTER *';
    // Likewise, the "no actor" actor has a standard name
    this.NO_ACTOR = '(no actor)';
    // As of version 0.9x50, equations are implemented as modifiers of a special
    // dataset, that therefore must have a system name
    this.EQUATIONS_DATASET_NAME = '___EQUATIONS___';
    this.EQUATIONS_DATASET_ID = this.EQUATIONS_DATASET_NAME.toLowerCase();
    // Character to separate object name from attribute in variable names
    this.OA_SEPARATOR = '|';
    // Use colon with space to separate prefixes and names of clones
    this.PREFIXER = ': ';
    // FROM->TO represented by solid right-pointing arrow with triangular head
    this.LINK_ARROW = '\u279D';
    // Right arrow with wave-curved shaft
    this.CONSTRAINT_ARROW = '\u219D';
    // Prefix for "black boxed" entities: solid black square
    this.BLACK_BOX = '\u25FC';
    this.BLACK_BOX_PREFIX = this.BLACK_BOX + ' ';
    this.MC = {
      // Difference types used in model comparison
      ADDED: 1,
      DELETED: 2,
      MODIFIED: 3,
      STATE: {1: 'added', 2: 'deleted', 3: 'modified'},
      SETTINGS_PROPS: {
        comments: 'Model description',
        last_modified: 'Last modified',
        version: 'Linny-R version',
        encrypt: 'Encrypt',
        time_scale: 'Time scale',
        time_unit: 'Time unit',
        currency_unit: 'Currency',
        default_unit: 'Default unit',
        decimal_comma: 'Use decimal comma',
        grid_pixels: 'Grid resolution',
        align_to_grid: 'Align to grid',
        with_power_flow: 'Add power flow constraints',
        infer_cost_prices: 'Infer cost prices',
        show_block_arrows: 'Show block arrows',
        timeout_period: 'Solver time-out',
        block_length: 'Block length',
        start_period: 'Start at',
        end_period: 'End at',
        look_ahead: 'Look-ahead'
      },
      ENTITY_PROPS: ['units', 'actors', 'clusters', 'processes', 'products',
        'datasets', 'equations', 'links', 'constraints'],
      UNIT_PROPS: ['multiplier', 'base_unit'],
      ACTOR_PROPS: ['weight', 'comments', 'TEX_id'],
      CLUSTER_PROPS: ['comments', 'collapsed', 'ignore'],
      PROCESS_PROPS: ['comments', 'lower_bound', 'upper_bound', 'initial_level',
        'pace_expression', 'equal_bounds', 'level_to_zero', 'integer_level',
        'collapsed', 'TEX_id'],
      PRODUCT_PROPS: ['comments', 'lower_bound', 'upper_bound', 'initial_level',
        'scale_unit', 'equal_bounds', 'price', 'is_source', 'is_sink', 'is_buffer',
        'is_data', 'integer_level', 'no_slack', 'TEX_id'],
      DATASET_PROPS: ['comments', 'default_value', 'scale_unit', 'time_scale',
        'time_unit', 'method', 'periodic', 'array', 'url', 'default_selector'],
      LINK_PROPS: ['comments', 'multiplier', 'relative_rate', 'share_of_cost',
        'flow_delay'],
      CONSTRAINT_PROPS: ['comments', 'no_slack', 'share_of_cost'],
      NOTE_PROPS: ['contents', 'color'],
      CHART_PROPS: ['comments', 'histogram', 'bins', 'show_title',
        'legend_position'],
      CHART_VAR_PROPS: ['stacked', 'color', 'scale_factor', 'line_width',
        'visible'],
      EXPERIMENT_PROPS: ['comments', 'configuration_dims',
        'column_scenario_dims', 'excluded_selectors'],
    };
    this.MC.ALL_PROPS = this.MC.ENTITY_PROPS +
        this.MC.UNIT_PROPS + this.MC.ACTOR_PROPS +
        this.MC.CLUSTER_PROPS + this.MC.PROCESS_PROPS +
        this.MC.PRODUCT_PROPS + this.MC.DATASET_PROPS + this.MC.LINK_PROPS +
        this.MC.CONSTRAINT_PROPS + this.MC.NOTE_PROPS + this.MC.CHART_PROPS +
        this.MC.CHART_VAR_PROPS + this.MC.EXPERIMENT_PROPS;
  }

  hidden() {
    // Console always returns TRUE, as it has no DOM tree, so any element can
    // be considered as "hidden"
    return true;
  }
  
  pointInViewport(rx, ry) {
    // Returns paper coordinates of the cursor position if the cursor were
    // located at relative position (rx * window width, ry * window height)
    // in the browser window
    if(this.paper) return this.paper.cursorPosition(
          window.innerWidth *rx, window.innerHeight *ry);
    // If no graphics return values for a 100x100 pixel viewport
    return [100 * rx, 100 * ry];
  }
  
  textSize(string, fsize=8, fweight=400) {
    // Returns width and height (in px) of (multi-line) string
    // If paper, use its method, which is more accurate
    if(this.paper) return this.paper.textSize(string, fsize, fweight);
    // If no paper, assume 144 px/inch, so 1 pt = 2 px
    const
        ch = fsize * 2,
        cw = fsize;
    // NOTE: Add '' in case string is a number
    const lines = ('' + string).split('\n');
    let w = 0;
    for(let i = 0; i < lines.length; i++) {
      w = Math.max(w, lines[i].length * cw);
    }
    return {width: w, height: lines.length * ch};
  }

  stringToLineArray(string, width=100, fsize=8) {
    // Returns an array of strings wrapped to given width at given font size
    // while preserving newlines -- used to format text of notes
    const
        multi = [],
        lines = string.split('\n'),
        ll = lines.length,
        // If no paper, assume 144 px/inch, so 1 pt = 2 px
        fh = (this.paper ? this.paper.font_heights[fsize] : 2 * fsize),
        scalar = fh / 2;
    for(let i = 0; i < ll; i++) {
      // NOTE: interpret two spaces as a "non-breaking" space
      const words = lines[i].replace(/  /g, '\u00A0').trim().split(/ +/);
      // Split words at '-' when wider than width
      for(let j = 0; j < words.length; j++) {
        if(words[j].length * scalar > width) {
          const sw = words[j].split('-');
          if(sw.length > 1) {
            // Replace j-th word by last fragment of split string
            words[j] = sw.pop();
            // Insert remaining fragments before
            while(sw.length > 0) words.splice(j, 0, sw.pop() + '-');
          }
        }
      }
      let line = words[0] + ' ';
      for(let j = 1; j < words.length; j++) {
        const
            l = line + words[j] + ' ',
            w = (l.length - 1) * scalar;
        if (w > width && j > 0) {
          const
              nl = line.trim(),
              nw = Math.floor(nl.length * scalar);
          multi.push(nl);
          // If width of added line exceeds the given width, adjust width
          // so that following lines fill out better
          width = Math.max(width, nw);
          line = words[j] + ' ';
        } else {
          line = l;
        }
      }
      line = line.trim();
      // NOTE: Chrome and Safari ignore empty lines in SVG text; as a workaround,
      // we add a non-breaking space to lines containing only whitespace
      if(!line) line = '\u00A0';
      multi.push(line);
    }
    return multi;  
  }
  
  sizeInBytes(n) {
    // Returns `n` as string scaled to the most appropriate unit of bytes
    n = Math.round(n);
    if(n < 1024) return n + ' B';
    let m = -1;
    while(n >= 1024) {
      m++;
      n /= 1024;
    }
    return VM.sig2Dig(n) + ' ' + 'kMGTP'.charAt(m) + 'B';
  }
  
  // Shapes are only used to draw model diagrams.
  
  createShape(mdl) {
    if(this.paper) return new Shape(mdl);
    return null;
  }
  
  moveShapeTo(shape, x, y) {
    if(shape) shape.moveTo(x, y);
  }
  
  removeShape(shape) {
    if(shape) shape.removeFromDOM();
  }

  // Methods to ensure proper naming of entities.

  cleanName(name) {
    // Returns `name` without the object-attribute separator |, backslashes,
    // and leading and trailing whitespace, and with all internal whitespace
    // reduced to a single space.
    name = name.replace(this.OA_SEPARATOR, ' ')
        .replace(/\||\\/g, ' ').trim()
        .replace(/\s\s+/g, ' ');
    // NOTE: this may still result in a single space, which is not a name
    if(name === ' ') return '';
    return name;
  }
  
  validName(name) {
    // Returns TRUE if `name` is a valid Linny-R entity name. These names
    // must not be empty strings, may not contain brackets, backslashes or
    // vertical bars, may not end with a colon, and must start with an
    // underscore, a letter or a digit.
    // These rules are enforced to avoid parsing issues with variable names.
    // NOTE: normalize to also accept letters with accents
    if(name === this.TOP_CLUSTER_NAME) return true;
    name = name.normalize('NFKD').trim();
    if(name.startsWith('$')) {
      const
          parts = name.substring(1).split(' '),
          flow = parts.shift(),
          aid = this.nameToID(parts.join(' ')),
          a = MODEL.actorByID(aid);
      return a && ['IN', 'OUT', 'FLOW'].indexOf(flow) >= 0;
    }
    return name && !name.match(/\[\\\|\]/) && !name.endsWith(':') &&
        (name.startsWith(this.BLACK_BOX) || name[0].match(/[\w]/));
  }
  
  prefixesAndName(name, key=false) {
    // Returns name split exclusively at '[non-space]: [non-space]'
    let sep = this.PREFIXER,
        space = ' ';
    if(key) {
      sep = ':_';
      space = '_';
    }
    const
        s = name.split(sep),
        pan = [s[0]];
    for(let i = 1; i < s.length; i++) {
      const j = pan.length - 1;
      if(s[i].startsWith(space) || (i > 0 && pan[j].endsWith(space))) {
        pan[j] += s[i];
      } else {
        pan.push(s[i]);
      }
    }
    return pan;
  }
  
  completePrefix(name) {
    // Returns the prefix part (including the final colon plus space),
    // or the empty string if none.
    const p = UI.prefixesAndName(name);
    p[p.length - 1] = '';
    return p.join(UI.PREFIXER);
  }
  
  sharedPrefix(n1, n2) {
    const
        pan1 = this.prefixesAndName(n1),
        pan2 = this.prefixesAndName(n2),
        l = Math.min(pan1.length - 1, pan2.length - 1),
        shared = [];
    let i = 0;
    while(i < l && ciCompare(pan1[i], pan2[i]) === 0) {
      // NOTE: if identical except for case, prefer "Abc" over "aBc" 
      shared.push(pan1[i] < pan2[i] ? pan1[i] : pan2[i]);
      i++;
    }
    return shared.join(this.PREFIXER);
  }
  
  colonPrefixedName(name, prefix) {
    // Replaces a leading colon in `name` by `prefix`.
    // If `name` identifies a link or a constraint, this is applied to
    // both node names.
    const
        arrow = (name.indexOf(this.LINK_ARROW) >= 0 ?
            this.LINK_ARROW : this.CONSTRAINT_ARROW),
        nodes = name.split(arrow);
    for(let i = 0; i < nodes.length; i++) {
      nodes[i] = nodes[i].replace(/^:\s*/, prefix)
          // NOTE: An embedded double prefix, e.g., "xxx: : yyy" indicates
          // that the second colon+space should be replaced by the prefix.
          // This "double prefix" may occur only once in an entity name,
          // hence no global regexp.
          .replace(/(\w+):\s+:\s+(\w+)/, `$1: ${prefix}$2`);
    }
    return nodes.join(arrow);
  }
  
  tailNumber(name) {
    // Returns the string of digits at the end of `name`. If not there,
    // check prefixes (if any) *from right to left* for a tail number.
    // Thus, the number that is "closest" to the name part is returned.
    const pan = UI.prefixesAndName(name);
    let n = endsWithDigits(pan.pop());
    while(!n && pan.length > 0) {
      n = endsWithDigits(pan.pop());
    }
    return n;
  }
  
  compareFullNames(n1, n2, key=false) {
    // Compare full names, considering prefixes in *left-to-right* order
    // while taking into account the tailnumber for each part so that
    // "xx: yy2: nnn" comes before "xx: yy10: nnn".
    if(n1 === n2) return 0;
    if(key) {
      // NOTE: Replacing link and constraint arrows by two prefixers
      // ensures that sort wil be first on FROM node, and then on TO node.
      const p2 = UI.PREFIXER + UI.PREFIXER;
      // Keys for links and constraints are not based on their names,
      // so look up their names before comparing.
      if(n1.indexOf('____') > 0 && MODEL.constraints[n1]) {
        n1 = MODEL.constraints[n1].displayName
            .replace(UI.CONSTRAINT_ARROW, p2);
      } else if(n1.indexOf('___') > 0 && MODEL.links[n1]) {
        n1 = MODEL.links[n1].displayName
            .replace(UI.LINK_ARROW, p2);
      }
      if(n2.indexOf('____') > 0 && MODEL.constraints[n2]) {
        n2 = MODEL.constraints[n2].displayName.
            replace(UI.CONSTRAINT_ARROW, p2);
      } else if(n2.indexOf('___') > 0 && MODEL.links[n2]) {
        n2 = MODEL.links[n2].displayName
            .replace(UI.LINK_ARROW, p2);
      }
      n1 = n1.toLowerCase().replaceAll(' ', '_');
      n2 = n2.toLowerCase().replaceAll(' ', '_');
    }
    const
        pan1 = UI.prefixesAndName(n1, key),
        pan2 = UI.prefixesAndName(n2, key),
        sl = Math.min(pan1.length, pan2.length);
    let i = 0;
    while(i < sl) {
      const c = compareWithTailNumbers(pan1[i], pan2[i]);
      if(c !== 0) return c;
      i++;
    }
    return pan1.length - pan2.length;
  }

  
  nameToID(name) {
    // Return a name in lower case with link arrow replaced by three
    // underscores, constraint link arrow by four underscores, and spaces
    // converted to underscores; in this way, IDs will always be valid
    // JavaScript object properties.
    // NOTE: Links and constraints are a special case, because their IDs
    // depend on the *codes* of their nodes.
    if(name.indexOf(UI.LINK_ARROW) >= 0 ||
        name.indexOf(UI.CONSTRAINT_ARROW) >= 0) {
      const obj = MODEL.objectByName(name);
      if(obj) return obj.identifier;
      // Empty string signals failure.
      return '';
    }
    // NOTE: Replace single quotes by Unicode apostrophe so that they
    // cannot interfere with JavaScript strings delimited by single quotes.
    return name.toLowerCase().replace(/\s/g, '_')
        .replace("'", '\u2019').replace('"', '\uff02');
  }
  
  htmlEquationName(n) {
    // Replaces the equations dataset name (system constant) by equation symbol
    // (square root of x) in white on purple
    return n.replace(this.EQUATIONS_DATASET_NAME + '|',
        '<span class="eq">\u221Ax</span>');
  }
  
  nameAsConstantString(n) {
    // Returns name with single quotes if it equals an Linny-R constant
    // or operator, or when it contains symbol separator characters or ']'
    let quoted = CONSTANT_SYMBOLS.indexOf(n) >= 0 ||
        MONADIC_OPERATORS.indexOf(n) >= 0 || n.indexOf(']') >= 0;
    if(!quoted) SEPARATOR_CHARS.split('').forEach(
        (c) => { if(n.indexOf(c) >= 0) quoted = true; });
    return (quoted ? `'${n}'` : n);
  }

  replaceEntity(str, en1, en2) {
    // Returns `en2` if `str` matches entity name `en1`; otherwise FALSE
    const n = str.trim().replace(/\s+/g, ' ').toLowerCase();
    if(n === en1) return en2;
    // Link variables contain TWO entity names, one of which can match with `en1`
    if(n.indexOf(this.LINK_ARROW) >= 0) {
      const
          ln = n.split(this.LINK_ARROW),
          tn0 = ln[0].trim();
      // Replace name of FROM node if it matches
      if(tn0 === en1) return en2 + this.LINK_ARROW + ln[1].trim();
      // Otherwise, replace name of TO node if it matches
      if(ln[1].trim() === en1) return tn0 + this.LINK_ARROW + en2;
    }
    // Return FALSE to indicate "no replacement made"
    return false;
  }

  // Methods to notify modeler
  
  setMessage(msg, type, cause=null) {
    // Only log errors and warnings on the browser console.
    // NOTE: Optionally, the JavaScript error can be passed via `cause`.
    if(type === 'error' || type === 'warning') {
      // Add type unless message already starts with it
      type = type.toUpperCase() + ':';
      if(!msg.startsWith(type)) msg = `${type} ${msg}`;
      // Strip HTML tags from message text unless UI is graphical
      if(!this.paper) msg = msg.replace(/<[^>]*>?/gm, '');
      console.log(msg);
      if(cause) console.log('Cause:', cause);
    }
  }

  notify(msg) {
    // Notifications are highlighted in blue, and sound a bell chime
    this.setMessage(msg, 'notification');
  }

  warn(msg, err=null) {
    // Warnings are highlighted in yellow, and sound a low beep
    this.setMessage(msg, 'warning', err);
  }

  alert(msg, err=null) {
    // Errors are highlighted in orange, and sound a "bloop" sound
    this.setMessage(msg, 'error', err);
  }
  
  // Alerts, parametrized warnings and notifications signalled in more than
  // one part of code
  
  errorOnPost(xhr) {
    this.alert(`Server error: ${xhr.status} ${xhr.statusText}`);
  }
    
  warningInvalidName(n) {
    this.warn(`Invalid name "${n}"`);
  }
  
  warningEntityExists(e) {
    // NOTE: `e` can be NULL when an invalid name was specified when renaming
    if(e) {
      let msg = `${e.type} "${e.displayName}" already exists`;
      if(e.displayName === this.TOP_CLUSTER_NAME ||
          e.displayName === this.EQUATIONS_DATASET_NAME) {
        msg = 'System names cannot be used as entity name';
      }
      this.warn(msg);
    }
  }
  
  warningInvalidWeightExpression(actor, err) {
    const n = (actor ? ' for ' + actor.displayName : '');
    this.warn(`Invalid weight expression${n}: ${err}`);
  }
  
  warningSetUpperBound(e) {
    this.warn(['Upper bound must be set due to constraint by ',
        e.type.toLowerCase(), ' <em>', e.displayName, '</em>'].join(''));
  }
  
  postResponseOK(text, notify=false) {
    // Check whether server reponse text is warning or error, and notify
    // the modeler if second argument is TRUE.
    let mtype = 'notification';
    if(text.startsWith('ERROR:')) {
      mtype = 'error';
    } else if(text.startsWith('WARNING:')) {
      mtype = 'warning';
      // Remove the 'WARNING:'
      text = text.substring(8).trim();
    }
    const ok = mtype === 'notification';
    if(!ok || notify) this.setMessage(text, mtype);
    return ok;
  }
  
  loginPrompt() {
    // The VM needs credentials - his should only occur for the GUI.
    console.log('WARNING: VM needs credentials, but GUI not active');
  }

  resetModel() {
    // Reset the Virtual Machine (clears solution). 
    VM.reset();
    // Redraw model in the browser (GUI only).
    MODEL.clearSelection();
    this.clearStatusLine();
    this.drawDiagram(MODEL);
  }
  
  stopSolving() {
    // Notify user only if VM was halted.
    if(VM.halted) {
      this.notify('Solver HALTED');
    } else {
      this.setMessage('');
    }
  }
  
  // NOTE: The following UI functions are implemented as "dummy" methods
  // because they are called by the Virtual Machine and/or by other
  // controllers while they can only be meaningfully performed by the
  // GUI controller.
  addListeners() {}
  readyToReset() {}
  updateScaleUnitList() {}
  drawDiagram() {}
  drawSelection() {}
  drawObject() {}
  drawLinkArrows() {}
  show() {}
  hide() {}
  readyToSolve() {}
  startSolving() {}
  waitToStop() {}
  normalCursor() {}
  rotatingIcon() {}
  setProgressNeedle() {}
  updateTimeStep() {}
  updateIssuePanel() {}
  clearStatusLine() {}
  updateDraggableDialogs() {}
  logHeapSize() {}
  
} // END of class Controller


// CLASS RepositoryBrowser
class RepositoryBrowser {
  constructor() {
    this.repositories = [];
    this.repository_index = -1; 
    this.module_index = -1;
    // Get the repository list from the server.
    this.getRepositories();
    this.reset();
  }
  
  reset() {
    this.visible = false;
    // NOTE: Do NOT reset repository list or module index, because:
    // (1) they are properties of the local host, and hence model-independent;
    // (2) they must be known when loading a module as model, whereas the
    //     loadingModel method hides and resets all stay-on-top dialogs.
  }

  get isLocalHost() {
    // Return TRUE if first repository on the list is 'local host'.
    return this.repositories.length > 0 &&
      this.repositories[0].name === 'local host';
  }

  getRepositories() {
    // Get the list of repository names from the server.
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
            // NOTE: Trim to prevent empty name strings.
            const rl = data.trim().split('\n');
            for(let i = 0; i < rl.length; i++) {
              this.addRepository(rl[i].trim());
            }
          }
          // NOTE: Set index to first repository on list (typically the
          // local host repository) unless the list is empty.
          this.repository_index = Math.min(0, this.repositories.length - 1);
          this.updateDialog();
        })
      .catch((err) => UI.warn(UI.WARNING.NO_CONNECTION, err));
  }
  
  repositoryByName(n) {
    // Return the repository having name `n` if already known, or NULL.
    for(let i = 0; i < this.repositories.length; i++) {
      if(this.repositories[i].name === n) {
        return this.repositories[i];
      }
    }
    return null;
  }
  
  asFileName(s) {
    // Return string `s` with whitespace converted to a single dash, and
    // special characters converted to underscores.
    return s.normalize('NFKD').trim()
        .replace(/[\s\-]+/g, '-')
        .replace(/[^A-Za-z0-9_\-]/g, '_')
        .replace(/^[\-\_]+|[\-\_]+$/g, '');
  }
  
  loadModuleAsModel() {
    // Load selected module as model.
    if(this.repository_index >= 0 && this.module_index >= 0) {
      // NOTE: When loading new model, the stay-on-top dialogs must be
      // reset (GUI only; for console this is a "dummy" method).
      UI.hideStayOnTopDialogs();
      const r = this.repositories[this.repository_index];
      // NOTE: pass FALSE to indicate "no inclusion; load XML as model".
      r.loadModule(this.module_index, false);
    }
  }
  
}  // END of class RepositoryBrowser


// CLASS DatasetManager controls the collection of datasets of a model
class DatasetManager {
  constructor() {
    // Initialize dialog properties
    this.methods = ['nearest', 'w-mean', 'w-sum', 'max'];
    this.method_symbols = ['&sim;t', '&mu;', '&Sigma;', 'MAX'];
    this.method_names =
        ['at nearest t', 'weighted mean', 'weighted sum', 'maximum'];
    this.reset();
  }

  reset() {
    this.visible = false;
    this.selected_dataset = null;
  }

  getRemoteDataset(url) {
    // Get remote data for selected dataset
    const ds = this.selected_dataset;
    if(ds) FILE_MANAGER.getRemoteData(ds, url);
  }

  // Dummy methods, meaningful only for the graphical dataset manager
  updateDialog() {}
  
} // END of class DatasetManager


// CLASS ChartManager controls the collection of charts of a model.
class ChartManager {
  constructor() {
    this.new_chart_title = '(new chart)';
    // NOTE: The SVG height is fixed at 500 units, as this gives good
    // results for the SVG units for line width = 1.
    // Fill patterns definitions are defined to work for images of this
    // height (see further down).
    this.svg_height = 500;
    this.container_height = this.svg_height;
    // Default aspect ratio W:H is 1.75. The stretch factor of the chart
    // manager will make the chart more oblong.
    this.container_width = this.svg_height * 1.75;
    this.legend_options = ['None', 'Top', 'Right', 'Bottom'];
    // Basic properties -- also needed for console application.
    this.visible = false;
    this.chart_index = -1;
    this.variable_index = -1;
    this.stretch_factor = 1;
    this.drawing_graph = false;
    this.runs_chart = false;
    this.runs_stat = false;
    // Arrows indicating sort direction.
    this.sort_arrows = {
      'not' : '',
      'asc': ' \u2B67',
      'desc': ' \u2B68',
      'asc-lead': ' \u21D7',
      'desc-lead': ' \u21D8'
    };
    // Fill styles used to differentiate between experiments in histograms.
    this.fill_styles = [
        'diagonal-cross-hatch', 'dots',
        'diagonal-hatch', 'checkers', 'horizontal-hatch',
        'cross-hatch', 'circles', 'vertical-hatch'
      ];
    
    // SVG for chart fill patterns.
    // NOTE: Mask width and height are based on SVG height = 500.
    this.fill_patterns = `
<pattern id="vertical-hatch" width="4" height="4"
  patternUnits="userSpaceOnUse">
  <line x1="0" y1="0" x2="0" y2="4" style="stroke:white; stroke-width:4" />
</pattern>
<mask id="vertical-hatch-mask" x="0" y="0" width="1" height="1" >
  <rect x="0" y="0" width="5000" height="500" fill="url(#vertical-hatch)" />
</mask>
<pattern id="horizontal-hatch" width="4" height="4"
  patternUnits="userSpaceOnUse">
  <line x1="0" y1="0" x2="4" y2="0" style="stroke:white; stroke-width:4" />
</pattern>
<mask id="horizontal-hatch-mask" x="0" y="0" width="1" height="1" >
  <rect x="0" y="0" width="5000" height="500" fill="url(#horizontal-hatch)" />
</mask>
<pattern id="diagonal-hatch" width="4" height="4"
  patternTransform="rotate(45 0 0)" patternUnits="userSpaceOnUse">
  <line x1="0" y1="0" x2="0" y2="4" style="stroke:white; stroke-width:6" />
</pattern>
<mask id="diagonal-hatch-mask" x="0" y="0" width="1" height="1" >
  <rect x="0" y="0" width="5000" height="500" fill="url(#diagonal-hatch)" />
</mask>
<pattern id="cross-hatch" width="5" height="5"
  patternUnits="userSpaceOnUse">
  <line x1="0" y1="0" x2="5" y2="0" style="stroke:white; stroke-width:3" />
  <line x1="0" y1="0" x2="0" y2="5" style="stroke:white; stroke-width:3" />
</pattern>
<mask id="cross-hatch-mask" x="0" y="0" width="1" height="1" >
  <rect x="0" y="0" width="5000" height="500" fill="url(#cross-hatch)" />
</mask>
<pattern id="diagonal-cross-hatch" width="5" height="5"
  patternTransform="rotate(45 0 0)" patternUnits="userSpaceOnUse">
  <line x1="0" y1="0" x2="5" y2="0" style="stroke:white; stroke-width:3" />
  <line x1="0" y1="0" x2="0" y2="5" style="stroke:white; stroke-width:3" />
</pattern>
<mask id="diagonal-cross-hatch-mask" x="0" y="0" width="1" height="1" >
  <rect x="0" y="0" width="5000" height="500" fill="url(#diagonal-cross-hatch)" />
</mask>
<pattern id="dots" width="5" height="5"
  patternUnits="userSpaceOnUse">
  <circle cx="2.5" cy="2.5" r="1.5" style="stroke:none; fill:white" />
</pattern>
<mask id="dots-mask" x="0" y="0" width="1" height="1" >
  <rect x="0" y="0" width="5000" height="500" fill="url(#dots)" />
</mask>
<pattern id="circles" width="8" height="8"
  patternUnits="userSpaceOnUse">
  <circle cx="4" cy="4" r="2.5" style="stroke:white; stroke-width:1" />
</pattern>
<mask id="circles-mask" x="0" y="0" width="1" height="1" >
  <rect x="0" y="0" width="5000" height="500" fill="url(#circles)" />
</mask>
<pattern id="checkers" width="10" height="10"
  patternUnits="userSpaceOnUse">
  <rect width="5" height="5" style="stroke:none; fill:white" />
  <rect x="5" y="5" width="5" height="5" style="stroke:none; fill:white" />
</pattern>
<mask id="checkers-mask" x="0" y="0" width="1" height="1" >
  <rect x="0" y="0" width="5000" height="500" fill="url(#checkers)" />
</mask>`;
  }

  reset() {
    this.visible = false;
    this.chart_index = -1;
    this.variable_index = -1;
    this.stretch_factor = 1;
    this.drawing_graph = false;
    this.runs_chart = false;
    this.runs_stat = false;
  }
  
  resetChartVectors() {
    // Reset vectors of all charts.
    for(let i = 0; i < MODEL.charts.length; i++) {
      MODEL.charts[i].resetVectors();
    }
  }

  promptForWildcardIndices(chart, dsm) {
    // No GUI dialog, so add *all* vectors for wildcard dataset modifier
    // `dsm` as variables to `chart`.
    const indices = Object.keys(dsm.expression.wildcard_vectors);
    chart.addWildcardVariables(dsm, indices);
  }

  setRunsChart(show) {
    // Indicate whether the chart manager should display a run result chart.
    this.runs_chart = show;
  }

  setRunsStat(show) {
    // Indicate whether the chart manager should display selected statistic
    // for selected runs as a bar chart.
    this.runs_stat = show;
  }

  // Dummy methods: actions that are meaningful only for the graphical UI
  updateDialog() {}
  updateExperimentInfo() {}
  showChartImage() {}
  
} // END of class ChartManager


// CLASS SensitivityAnalysis provides the sensitivity analysis functionality
class SensitivityAnalysis {
  constructor() {
    // Initialize main dialog properties.
    this.reset();
    // Sensitivity analysis creates & disposes an experiment and a chart.
    this.experiment_title = '___SENSITIVITY_ANALYSIS___';
    this.chart_title = '___SENSITIVITY_ANALYSIS_CHART___';
  }

  reset() {
    this.visible = false;
    this.data = {};
    this.perc = {};
    this.shade = {};
    this.options_shown = true;
    this.selected_parameter = -1;
    this.selected_outcome = -1;
    this.checked_parameters = {};
    this.checked_outcomes = {};
    this.relative_scale = true;
    this.color_scale = new ColorScale('no');
    this.selected_statistic = 'mean';
    this.chart = null;
    this.experiment = null;
    this.must_pause = false;
    this.selected_run = -1;
  }

  start() {
    // A sensitivity analysis is a series of runs with identical exogenous
    // variables except for one parameter that is multiplied by (1 + delta %).
    // Since expressions perform this multiplication when they are marked as
    // the "active" parameter, it suffices to perform the *same* experiment run
    // as many times as there are parameters while changing only the "active"
    // parameter. The "base selectors" constitute the *single* combination that
    // must be run. To ensure that the data on all outcome variables are stored,
    // a dummy chart is created that includes all these outcomes as *chart*
    // variables.
    if(!this.experiment) {
      // Clear results from previous analysis.
      this.clearResults();
      this.parameters = [];
      for(let i = 0; i < MODEL.sensitivity_parameters.length; i++) {
        const
            p = MODEL.sensitivity_parameters[i],
            vn = p.split(UI.OA_SEPARATOR),
            obj = MODEL.objectByName(vn[0]),
            oax = (obj ? obj.attributeExpression(vn[1]) : null);
        if(oax) {
          this.parameters.push(oax);
        } else if(vn.length === 1 && obj instanceof Dataset) {
          // Dataset without selector => push the dataset vector.
          this.parameters.push(obj.vector);
        } else {
          UI.alert(`Parameter ${p} is not a dataset or expression`);
        }
      }
      this.chart = new Chart(this.chart_title);
      for(let i = 0; i < MODEL.sensitivity_outcomes.length; i++) {
        const vn = MODEL.sensitivity_outcomes[i].split(UI.OA_SEPARATOR);
        this.chart.addVariable(vn[0], vn[1]);
      }
      this.experiment = new Experiment(this.experiment_title);
      this.experiment.charts = [this.chart];
      this.experiment.inferVariables();
      // This experiment always uses the same combination: the base selectors.
      const bs = MODEL.base_case_selectors.split(' ');
      this.experiment.combinations = [];
      // Add this combination N+1 times for N parameters.
      for(let i = 0; i <= this.parameters.length; i++) {
        this.experiment.combinations.push(bs);
      }
      // NOTE: Model settings will not be changed, but will be restored after
      // each run => store the original settings.
      this.experiment.original_model_settings = MODEL.settingsString;
      this.experiment.original_round_sequence = MODEL.round_sequence;
    }
    // Change the button (GUI only -- console will return FALSE).
    const paused = this.resumeButtons();
    if(!paused) {
      this.experiment.time_started = new Date().getTime();
      this.experiment.active_combination_index = 0;
      // NOTE: Start with base case run, hence no active parameter yet.
      MODEL.running_experiment = this.experiment;
    }
    // Let the experiment manager do the work!!
    EXPERIMENT_MANAGER.runModel();
  }
  
  processRestOfRun() {   
    // This method is called by the experiment manager after a SA run.
    const x = MODEL.running_experiment;
    if(!x) return;
    // Double-check that indeed the SA experiment is running.
    if(x !== this.experiment) {
      UI.alert('ERROR: Expected SA experiment run, but got ' + x.title);
      return;
    } 
    const aci = x.active_combination_index;
    // Always add solver messages.
    x.runs[aci].addMessages();
    // NOTE: Use a "dummy experiment object" to ensure proper XML saving and
    // loading , as the actual experiment is not stored.
    x.runs.experiment = {title: SENSITIVITY_ANALYSIS.experiment_title};
    // Add run to the sensitivity analysis.
    MODEL.sensitivity_runs.push(x.runs[aci]);
    this.showProgress('Run #' + aci);
    // See if more runs should be done.
    const n = x.combinations.length;
    if(!VM.halted && aci < n - 1) {
      if(this.must_pause) {
        this.pausedButtons(aci);
        UI.setMessage('');
      } else {
        // NOTE: Use aci because run #0 is the base case w/o active parameter.
        MODEL.active_sensitivity_parameter = this.parameters[aci];
        x.active_combination_index++;
        setTimeout(() => EXPERIMENT_MANAGER.runModel(), 5);
      }
    } else {
      x.time_stopped = new Date().getTime();
      x.completed = aci >= n - 1;
      x.active_combination_index = -1;
      if(VM.halted) {
        UI.notify(
            `Experiment <em>${x.title}</em> terminated during run #${aci}`);
      } else {
        this.showCheckmark(msecToTime(x.time_stopped - x.time_started));
      }
      // No more runs => perform wrap-up.
      // (1) Restore original model settings.
      MODEL.running_experiment = null;
      MODEL.active_sensitivity_parameter = null;
      MODEL.parseSettings(x.original_model_settings);
      MODEL.round_sequence = x.original_round_sequence;
      // (2) Reset the Virtual Machine so t=0 at the status line, and ALL
      // expressions are reset as well.
      VM.reset();
      // Free the SA experiment and SA chart.
      this.experiment = null;
      this.chart = null;
      // Reset buttons (GUI only).
      this.readyButtons();
    }
    this.updateDialog();
    // Reset the model, as results of last run will be showing still.
    UI.resetModel();
    CHART_MANAGER.resetChartVectors();
    // NOTE: Clear chart only when done (charts do not update during experiment).
    if(!MODEL.running_experiment) CHART_MANAGER.updateDialog();
  }

  stop() {
    // Interrupt solver but retain data on server (and no resume).
    VM.halt();
    this.readyButtons();
    this.showProgress('');
    this.must_pause = false;
  }
  
  clearResults() {
    // Clear results, and reset control buttons.
    MODEL.sensitivity_runs.length = 0;
    this.selected_run = -1;
  }
  
  computeData(sas) {
    // Compute data value or status for statistic `sas`.
    this.perc = {};
    this.shade = {};
    this.data = {};
    const
        ol = MODEL.sensitivity_outcomes.length,
        rl = MODEL.sensitivity_runs.length;
    if(ol === 0) return;
    // Always find highest relative change.
    let max_dif = 0;
    for(let i = 0; i < ol; i++) {
      this.data[i] = [];
      for(let j = 0; j < rl; j++) {
        // Get the selected statistic for each run to get an array of numbers.
        const rr = MODEL.sensitivity_runs[j].results[i];
        if(!rr) {
          this.data[i].push(VM.UNDEFINED);
        } else if(sas === 'N') {
          this.data[i].push(rr.N);
        } else if(sas === 'sum') {
          this.data[i].push(rr.sum);
        } else if(sas === 'mean') {
          this.data[i].push(rr.mean);
        } else if(sas === 'sd') {
          this.data[i].push(Math.sqrt(rr.variance));
        } else if(sas === 'min') {
          this.data[i].push(rr.minimum);
        } else if(sas === 'max') {
          this.data[i].push(rr.maximum);
        } else if(sas === 'nz') {
          this.data[i].push(rr.non_zero_tally);
        } else if(sas === 'except') {
          this.data[i].push(rr.exceptions);
        } else if(sas === 'last') {
          this.data[i].push(rr.last);
        }
      }
      // Compute the relative change.
      let bsv = this.data[i][0];
      if(Math.abs(bsv) < VM.NEAR_ZERO) bsv = 0;
      this.perc[i] = [];
      if(bsv > VM.MINUS_INFINITY && bsv < VM.PLUS_INFINITY) {
        for(let j = 1; j < this.data[i].length; j++) {
          let v = this.data[i][j];
          if(v > VM.MINUS_INFINITY && v < VM.PLUS_INFINITY) {
            if(bsv === 0) {
              v = (v === 0 ? 0 : VM.UNDEFINED);
            } else {
              v = (v - bsv) / bsv * 100;
              max_dif = Math.max(max_dif, Math.abs(v));
            }
            this.perc[i].push(v);
          }
        }
      } else {
        for(let j = 1; j < this.data[i].length; j++) this.perc[i].push('-');
      }
    }
    // Now use max_dif to compute shades.
    for(let i = 0; i < ol; i++) {      
      this.shade[i] = [];
      // Color scale range is -max ... +max (0 in center => white).
      for(let j = 0; j < this.perc[i].length; j++) {
        const p = this.perc[i][j];
        this.shade[i].push(p === VM.UNDEFINED || max_dif < VM.NEAR_ZERO ?
            0.5 : (p / max_dif + 1) / 2);
      }
      // Convert to sig4Dig.
      for(let j = 0; j < this.data[i].length; j++) {
        this.data[i][j] = VM.sig4Dig(this.data[i][j]);
      }
      // Format data such that they all have same number of decimals.
      if(this.relative_scale && this.perc[i][0] !== '-') {
        for(let j = 0; j < this.perc[i].length; j++) {
          this.perc[i][j] = VM.sig4Dig(this.perc[i][j]);
        }
        uniformDecimals(this.perc[i]);
        // NOTE: Only consider data of base scenario.
        this.data[i][0] = VM.sig4Dig(this.data[i][0]);
      } else {
        uniformDecimals(this.data[i]);
      }
    }
  }
  
  resumeButtons() {
    // Console experiments cannot be paused, and hence not resumed.
    return false;
  }

  // Dummy methods: actions that are meaningful only for the graphical UI.
  updateDialog() {}
  showCheckmark() {}
  showProgress() {}
  drawTable() {}
  readyButtons() {}
  pausedButtons() {}

} // END of class SensitivityAnalysis


// Class ExperimentManager controls the collection of experiments of the model
class ExperimentManager {
  constructor() {
    // NOTE: The properties below are relevant only for the GUI.
    this.experiment_table = null;
    this.focal_table = null;
  }

  reset() {
    this.visible = false;
    this.callback = null;
    this.selected_experiment = null;
    this.suitable_charts = [];
    this.plot_dimensions = [];
  }
  
  updateChartList() {
    // Select charts having 1 or more variables, as only these are meaningful
    // as the dependent variables of an experiment
    this.suitable_charts.length = 0;
    for(let i = 0; i < MODEL.charts.length; i++) {
      const c = MODEL.charts[i];
      if(c.variables.length > 0) this.suitable_charts.push(c);
    }
  }  
  
  selectedRuns(chart) {
    // Return list of run numbers selected in the Experiment Manager.
    const selx = this.selected_experiment;
    if(CHART_MANAGER.runs_chart && selx &&
       (selx.charts.indexOf(chart) >= 0 || CHART_MANAGER.runs_stat)) {
      return selx.chart_combinations;
    }
    return [];
  }
  
  get selectedStatisticName() {
    // Return full name of selected statistic.
    const x = this.selected_experiment;
    if(!x) return '';
    if(x.selected_scale === 'sec') return 'Solver time';
    const sn = {
        'N': 'Count',
        'mean': 'Mean',
        'sd': 'Standard deviation',
        'sum': 'Sum',
        'min': 'Lowest value',
        'max': 'Highest value',
        'nz': 'Non-zero count',
        'except': 'Exception count',
        'last': 'Value at final time step'
      };
    return sn[x.selected_statistic] || '';
  }
  
  selectExperiment(title) {
    const xi = MODEL.indexOfExperiment(title);
    this.selected_experiment = (xi < 0 ? null : MODEL.experiments[xi]);
    this.focal_table = this.experiment_table;
    this.updateDialog();
  }

  updateDialog() {
    // NOTE: no GUI elements to update, but experiment parameters must be set
    MODEL.inferDimensions();
    const x = this.selected_experiment;
    if(!x) return;
    x.updateActorDimension();
    x.inferActualDimensions();
    x.inferCombinations();
  }

  clearRunResults() {
    // Clears all run results
    const x = this.selected_experiment;
    if(x) {
      x.clearRuns();
      this.updateDialog();
    }    
  }

  startExperiment(n=-1) {
    // Recompile expressions, as these may have been changed by the modeler
    MODEL.compileExpressions();
    // Start sequence of solving model parametrizations
    const x = this.selected_experiment;
    if(x) {
      // Store original model settings
      x.original_model_settings = MODEL.settingsString;
      x.original_round_sequence = MODEL.round_sequence;
      // NOTE: switch off run chart display
      CHART_MANAGER.setRunsChart(false);
      // When Chart manager is showing, close it and notify modeler that charts
      // should not be viewed during experiments
      if(CHART_MANAGER.visible) {
        UI.buttons.chart.dispatchEvent(new Event('click'));
        UI.notify(UI.NOTICE.NO_CHARTS);
      }
      // Change the buttons -- will return TRUE if experiment was paused
      const paused = this.resumeButtons();
      if(x.completed && n >= 0) {
        x.single_run = n; 
        x.active_combination_index = n;
        MODEL.running_experiment = x;
      } else if(!paused) {
        // Clear previous run results (if any) unless resuming
        x.clearRuns();
        x.inferVariables();
        x.time_started = new Date().getTime();
        x.active_combination_index = 0;
        MODEL.running_experiment = x;
      } else {
        x.active_combination_index++;
        UI.notify('Experiment resumed at run #' + x.active_combination_index);
      }
      this.runModel();
    }
  }

  runModel() {
    const x = MODEL.running_experiment;
    if(x) {
      const
          ci = x.active_combination_index,
          n = x.combinations.length,
          p = Math.floor(ci * 100 / n),
          combi = x.combinations[ci];
      let xr;
      if(x.single_run >= 0) {
        xr = x.runs[x.single_run];
      } else {
        xr = new ExperimentRun(x, ci);
        x.runs.push(xr);
      }
      xr.start();
      this.showProgress(ci, p, n);
      // NOTE: first restore original model settings (setings may be partial!)
      MODEL.parseSettings(x.original_model_settings);
      // Parse all active settings selector strings
      // NOTE: may be multiple strings; the later overwrite the earlier
      for(let i = 0; i < x.settings_selectors.length; i++) {
        const ssel = x.settings_selectors[i].split('|');
        if(combi.indexOf(ssel[0]) >= 0) MODEL.parseSettings(ssel[1]);
      }
      // Also set the correct round sequence
      // NOTE: if no match, default is retained
      for(let i = 0; i < x.actor_selectors.length; i++) {
        const asel = x.actor_selectors[i];
        if(combi.indexOf(asel.selector) >= 0) {
          MODEL.round_sequence = asel.round_sequence;
        }
      }
      // Only now compute the simulation run time (number of time steps)
      xr.time_steps = MODEL.end_period - MODEL.start_period + 1;
      VM.callback = this.callback;
      // NOTE: Asynchronous call. All follow-up actions must be performed
      // by the callback function.
      VM.solveModel();
    }
  }
  
  processRun() {
    // This method is called by the solveBlocks method of the Virtual Machine
    const x = MODEL.running_experiment;
    if(!x) return;
    const aci = x.active_combination_index;
    if(MODEL.solved) {
      // NOTE: addresults will call processRestOfRun when completed
      x.runs[aci].addResults();
    } else {
      // Do not add results...
      UI.warn(`Model run #${aci} incomplete -- results will be invalid`);
      // ... but do perform the usual post-processing
      // NOTE: when sensitivity analysis is being performed, switch back to SA
      if(SENSITIVITY_ANALYSIS.experiment) {
        SENSITIVITY_ANALYSIS.processRestOfRun();
      } else {
        this.processRestOfRun();
      }
    }
  }

  processRestOfRun() {   
    // Perform post-processing after run results have been added.
    const x = MODEL.running_experiment;
    if(!x) return;
    const aci = x.active_combination_index;
    // Always add solver messages.
    x.runs[aci].addMessages();
    const n = x.combinations.length;
    if(!VM.halted && aci < n - 1 && aci != x.single_run) {
      if(this.must_pause) {
        this.pausedButtons(aci);
        this.must_pause = false;
        UI.setMessage('');
      } else {
        x.active_combination_index++;
        let delay = 5;
        // NOTE: When executing a remote command, wait for 1 second to
        // allow enough time for report writing.
        if(RECEIVER.active && RECEIVER.experiment) {
          UI.setMessage('Reporting run #' + (x.active_combination_index - 1));
          delay = 1000;
        }
        setTimeout(() => EXPERIMENT_MANAGER.runModel(), delay);
      }
    } else {
      x.time_stopped = new Date().getTime();
      if(x.single_run >= 0) {
        x.single_run = -1;
        x.completed = true;
      } else {
        x.completed = aci >= n - 1;
      }
      x.active_combination_index = -1;
      if(VM.halted) {
        UI.notify(
            `Experiment <em>${x.title}</em> terminated during run #${aci}`);
        RECEIVER.deactivate();
      }
      // No more runs => stop experiment, and perform call-back.
      // NOTE: If call-back is successful, the receiver will resume listening.
      if(RECEIVER.active) {
        RECEIVER.experiment = '';
        RECEIVER.callBack();
      }
      // Restore original model settings
      MODEL.running_experiment = null;
      MODEL.parseSettings(x.original_model_settings);
      MODEL.round_sequence = x.original_round_sequence;
      // Reset the Virtual Machine so t=0 at the status line,
      // and ALL expressions are reset as well.
      VM.reset();
      this.readyButtons();
    }
    this.drawTable();
    // Reset the model, as results of last run will be showing still.
    UI.resetModel();
    CHART_MANAGER.resetChartVectors();
    // NOTE: Clear chart only when done; charts do not update when an
    // experiment is running.
    if(!MODEL.running_experiment) CHART_MANAGER.updateDialog();
  }

  stopExperiment() {
    // Interrupt solver but retain data on server (and no resume).
    VM.halt(); 
  }
  
  showProgress(ci, p, n) {
    // Report progress on the console.
    console.log('\nRun', ci, `(${p}% of ${n})`);
  }

  resumeButtons() {
    // Console experiments cannot be paused, and hence not resumed.
    return false;
  }

  // Dummy methods: actions that are meaningful only for the graphical UI.
  drawTable() {}
  readyButtons() {}
  pausedButtons() {}
  
} // END of class ExperimentManager


/////////////////////////////////////////////////////////////////////////////
// Define exports so this file can also be included as a module in Node.js //
/////////////////////////////////////////////////////////////////////////////
if(NODE) module.exports = {
  Controller: Controller,
  DatasetManager: DatasetManager,
  ChartManager: ChartManager,
  SensitivityAnalysis: SensitivityAnalysis,
  ExperimentManager: ExperimentManager
};
