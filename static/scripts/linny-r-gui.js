/*
Linny-R is an executable graphical specification language for (mixed integer)
linear programming (MILP) problems, especially unit commitment problems (UCP).
The Linny-R language and tool have been developed by Pieter Bots at Delft
University of Technology, starting in 2009. The project to develop a browser-
based version started in 2017. See https://linny-r.org for more information.

This JavaScript file (linny-r-gui.js) provides the GUI functionality
for the Linny-R model editor: buttons on the main tool bars, the associated
dialogs, the main drawing canvas, and event handler functions.

*/

/*
Copyright (c) 2017-2022 Delft University of Technology

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

// CLASS Shape
// A shape is a group of one or more SVG elements with a time-based ID number,
// and typically represents an entity in a Linny-R model diagram
class Shape {
  constructor(owner) {
    this.owner = owner;
    this.id = randomID();
    if(UI.paper) {
      // Create a new SVG element, but do not add it to the main SVG object
      // NOTE: by default, only constraints respond to pointer events
      const ow = (owner instanceof Constraint ? owner : null);
      this.element = UI.paper.newSVGElement('svg', ow);
      this.element.id = this.id;
    }
  }
  
  clear() {
    // Removes all composing elements from this shape's SVG object
    UI.paper.clearSVGElement(this.element);
  }

  appendToDOM() {
    // Appends this shape's SVG element to the main SVG object
    const el = document.getElementById(this.id);
    // Replace existing element, if it exists
    if(el) UI.paper.svg.removeChild(el);
    // Add the new version
    UI.paper.svg.appendChild(this.element);
  }
  
  removeFromDOM() {
    // Removes this shape's SVG element from the main SVG object
    const el = document.getElementById(this.id);
    if(el) UI.paper.svg.removeChild(el);
    this.element = null;
  }

  addPath(path, attrs) {
    // Appends a path to the SVG element for this shape
    const
        ow = (this.owner instanceof Constraint ? this.owner : null),
        el = UI.paper.newSVGElement('path', ow);
    el.setAttribute('d', path.join(''));
    UI.paper.addSVGAttributes(el, attrs);
    this.element.appendChild(el);
    return el;
  }
  
  addNumber(x, y, number, attrs) {
    // Appends SVG for a numeric string centered at (x, y)
    // NOTES:
    // (1) A numeric string is scaled to a fixed width per character
    //     (0.65*font size) 
    // (2) If anchor is not "middle", x is taken as the border to align against
    // (3) Calling routines may pass a number instead of a string, so "lines"
    //     is forced to a string
    number = '' + number;
    // Assume default font size and weight unless specified
    const
        size = (attrs.hasOwnProperty('font-size') ?
            attrs['font-size'] : 8),
        weight = (attrs.hasOwnProperty('font-weight') ?
            attrs['font-weight'] : 400),
        fh = UI.paper.font_heights[size],
        el = UI.paper.newSVGElement('text');
    el.setAttribute('x', x);
    el.setAttribute('y', y + 0.35*fh);
    el.setAttribute('textLength',
        UI.paper.numberSize(number, size, weight).width);
    el.textContent = number;
    UI.paper.addSVGAttributes(el, attrs);
    this.element.appendChild(el);
    return el;
  }

  addText(x, y, lines, attrs) {
    // Appends SVG for a (multi)string centered at (x, y)
    // NOTES:
    // (1) If anchor is not "middle", x is taken as the border to align against
    // (2) Calling routines may pass a number, a string or an array
    if(!Array.isArray(lines)) {
      // Force `lines` into a string, and then split it at newlines
      lines = ('' + lines).split('\n');
    }
    // Assume default font size unless specified
    const size = (attrs.hasOwnProperty('font-size') ? attrs['font-size'] : 8);
    // Vertically align text such that y is at its center
    // NOTE: subtract 30% of 1 line height more, or the text is consistently
    // too low
    const
        fh = UI.paper.font_heights[size],
        cy = y - (lines.length + 0.3) * fh/2,
        el = UI.paper.newSVGElement('text');
    el.setAttribute('x', x);
    el.setAttribute('y', cy);
    UI.paper.addSVGAttributes(el, attrs);
    for(let i = 0; i < lines.length; i++) {
      const ts = UI.paper.newSVGElement('tspan');
      ts.setAttribute('x', x);
      ts.setAttribute('dy', fh);
      ts.textContent = lines[i];
      el.appendChild(ts);
    }
    this.element.appendChild(el);
    return el;
  }

  addRect(x, y, w, h, attrs) {
    // Adds a rectangle with center point (x, y), width w, and height h
    // NOTE: for a "roundbox", pass the corner radii rx and ry
    const
        ow = (this.owner instanceof Constraint ? this.owner : null),
        el = UI.paper.newSVGElement('rect', ow);
    el.setAttribute('x', x - w/2);
    el.setAttribute('y', y - h/2);
    el.setAttribute('width', Math.max(0, w));
    el.setAttribute('height', Math.max(0, h));
    UI.paper.addSVGAttributes(el, attrs);
    this.element.appendChild(el);
    return el;
  }

  addCircle(x, y, r, attrs) {
    // Adds a circle with center point (x, y) and radius r
    const el = UI.paper.newSVGElement('circle');
    el.setAttribute('cx', x);
    el.setAttribute('cy', y);
    el.setAttribute('r', r);
    UI.paper.addSVGAttributes(el, attrs);
    this.element.appendChild(el);
    return el;
  }

  addEllipse(x, y, rx, ry, attrs) {
    // Adds an ellipse with center point (x, y), and specified radii and
    // attributes
    const el = UI.paper.newSVGElement('ellipse');
    el.setAttribute('cx', x);
    el.setAttribute('cy', y);
    el.setAttribute('rx', rx);
    el.setAttribute('ry', ry);
    UI.paper.addSVGAttributes(el, attrs);
    this.element.appendChild(el);
    return el;
  }

  addSVG(x, y, attrs) {
    // Adds an SVG subelement with top-left (x, y) and specified attributes
    const
        ow = (this.owner instanceof Constraint ? this.owner : null),
        el = UI.paper.newSVGElement('svg', ow);
    el.setAttribute('x', x);
    el.setAttribute('y', y);
    UI.paper.addSVGAttributes(el, attrs);
    this.element.appendChild(el);
    return el;
  }
  
  addBlockArrow(x, y, io, n) {
    // Adds a colored block arrow with the number `n` in white IF n > 0
    // NOTE: the ID of the owner of this shape (cluster, process or product)
    // is passed as data attribute so that the SVG element "knows" for which
    // entity the hidden flows must be displayed. The `io` data attribute
    // indicates whether it concerns IN, OUT or IO flows
    if(n <= 0) return;
    const
        p = (io === UI.BLOCK_IO ?
            ['M', x-4, ',', y-5, 'h8v-2l6,7l-6,7v-2h-8v2l-6,-7l6,-7z'] :
            ['M', x-6, ',', y-5, 'h10v-2l6,7l-6,7v-2h-10z']),
        a = this.addPath(p,
            {'fill': UI.color.block_arrow, 'stroke': 'black',
                'stroke-width': 0.4, 'stroke-linejoin': 'round',
                'data-id': this.owner.identifier, 'data-io': io});
    this.addText(x, y, n, {'fill': 'white'});
    // Make SVG element responsive to cursor event
    a.setAttribute('pointer-events', 'auto');
    a.addEventListener('mouseover',
        (event) => {
            const
                el = event.target,
                nb = MODEL.nodeBoxByID(el.dataset.id);
            if(nb) {
              DOCUMENTATION_MANAGER.showHiddenIO(nb,
                  parseInt(el.dataset.io));
            }
          });
    a.addEventListener('mouseout', () => { UI.on_block_arrow = false; });
    return this.element;
  }

  moveTo(x, y) {
    const el = document.getElementById(this.id);
    if(el) {
      el.setAttribute('x', x);
      el.setAttribute('y', y);
    }
  }
  
} // END of class Shape


// CLASS Paper (the SVG diagram)
class Paper {
  constructor() {
    this.svg = document.getElementById('svg-root');
    this.container = document.getElementById('cc');
    this.height = 100;
    this.width = 200;
    this.zoom_factor = 1;
    this.zoom_label = document.getElementById('zoom');
    // Initialize colors used when drawing the model diagram
    this.palette = {
      // Selected model elements are bright red
      select: '#ff0000',    
      // Nodes (clusters, products and processes) have dark gray rim...
      node_rim: '#707070',
      // ... and state-dependent fill colors
      node_fill: '#ffffff',
      src_snk: '#e0e0e0',
      has_bounds: '#f4f4f4',
      // Products are red if stock is below target, blue if above target...
      below_lower_bound: '#ffb0b0',
      above_upper_bound: '#b0b0ff',
      // Clusters are mixed if they involve GE as well as LE slack
      beyond_both_bounds: '#ffb0ff',
      // ... and different shades of green if within or on their bounds
      neg_within_bounds: '#e0ffb0',
      pos_within_bounds: '#b0ffe0',
      zero_within_bounds: '#c8ffc8',
      // Product are filled in darker green shades ...
      below_zero_fill: '#c0f070',
      above_zero_fill: '#70f0c0',
      at_zero_fill: '#98f098',
      // ... and still a bit darker when at LB and more so at UB
      at_pos_lb_fill: '#60f0b0',
      at_pos_ub_fill: '#50e0a8',
      at_neg_lb_fill: '#b0f060',
      at_neg_ub_fill: '#a0e050',
      at_zero_lb_fill: '#88f088',
      at_zero_ub_fill: '#78e078',
      // Constants are data products having non-zero LB = UB,
      // and NO in/out flows 
      neg_constant: '#e0e8b0',
      pos_constant: '#b0e8e0',
      // If no bounds but non-zero: light orange if < 0, light cyan if > 0
      positive_stock: '#b0f8ff',
      negative_stock: '#fff0b0',
      // Font colors for products
      actor_font: '#600060', // deep purple
      unit: '#006000', // dark green
      consumed: '#b00000', // deep red
      produced: '#0000b0', // navy blue
      within_bounds_font: '#007000', // dark green
      // Process with level > 0 has a dark blue rim and production level font
      active_process: '#000080',
      // The % (level / process upper bound) is drawn as a vertical bar
      process_level_bar: '#dcdcff',
      // Processes with level = upper bound are displayed in purple shades
      at_process_ub: '#500080',
      at_process_ub_fill: '#f8f0ff',
      at_process_ub_bar: '#e8d8f8',
      at_process_ub_arrow: '#f0b0e8',
      // NOTE: special color when level at negative lower bound
      at_process_neg_lb: '#800050',
      // Process with unbound level = +INF is displayed in maroon-red
      infinite_level: '#a00001',
      infinite_level_fill: '#ff90a0',
      // Process state change symbols are displayed in red
      switch_on_off: '#b00000',
      // Compound arrows with non-zero actual flow are displayed in red-purple
      compound_flow: '#800060',
      // Market prices are displayed in gold(!)yellow rectangles
      price: '#ffe000',
      price_rim: '#a09000',
      // Cost prices are displayed in light yellow rectangles...
      cost_price: '#ffff80',
      // ... and even lighter if computed for a process having level 0
      virtual_cost_price: '#ffffc0',
      // Cash flows of clusters likewise a light yellow shade
      cash_flow: '#ffffb0',
      // Share of cost percentages are displayed in orange to signal that
      // they total to more than 100% for a process
      soc_too_high: '#f08020',
      // Ignored clusters are crossed out, and all ignored entities are outlined
      // in a pastel fuchsia
      ignore: '#cc88b0',
      // Block arrows are filled in grayish purple
      block_arrow: '#9070a0',
      // All notes have thin gray rim, similar to other model diagram elements,
      // that turns red when a note is selected
      note_rim: '#909090',  // medium gray
      note_font: '#2060a0', // medium dark gray-blue
      // Notes are semi-transparent (will have opacity 0.5) and have a fixed
      // range of color numbers (0 - 5) that correspond to lighter and darker
      // shades of yellow, green, cyan, fuchsia, light gray, and bright red.
      note_fill:
        ['#ffff80', '#80ff80', '#80ffff', '#ff80ff', '#f8f8f8', '#ff2000'],
      note_band:
        ['#ffd860', '#60d860', '#60d8ff', '#d860ff', '#d0d0d0', '#101010'],  
      // Computation errors in expressions are signalled by displaying
      // the result in bright red, typically the general error symbol (X)
      VM_error: '#e80000',
      // Background color of GUI dialogs
      dialog_background: '#f4f0f2'
    };
    this.io_formats = [
        {'font-size': 10},
        {'font-size': 10, 'font-style': 'oblique',
            'text-decoration': 'underline dotted 1.5px'},
        {'font-size': 10, 'font-weight': 'bold',
            'text-decoration': 'underline dotted 1.5px'}];
    // Standard SVG URL
    this.svg_url = 'http://www.w3.org/2000/svg';
    this.clear();
  }
  
  clear() {
    // First, clear the entire SVG
    this.clearSVGElement(this.svg);
    // Set default style properties
    this.svg.setAttribute('font-family', this.font_name);
    this.svg.setAttribute('font-size', 8);
    this.svg.setAttribute('text-anchor', 'middle');
    this.svg.setAttribute('alignment-baseline', 'middle');
    // Add marker definitions
    const
        defs = this.newSVGElement('defs'),
        // Standard arrow tips: solid triangle
        tri = 'M0,0 L10,5 L0,10 z',
        // Wedge arrow tips have no baseline
        wedge = 'M0,0 L10,5 L0,10 L0,8.5 L8.5,5 L0,1.5 z',
        // Constraint arrows have a flat, "chevron-style" tip
        chev = 'M0,0 L10,5 L0,10 L4,5 z',
        // Feedback arrows are hollow and have hole in their baseline
        fbt = 'M0,3L0,0L10,5L0,10L0,7L1.5,7L1.5,8.5L8.5,5L1.5,1.5L1.5,3z';

    // NOTE: standard SVG elements are defined as properties of this paper
    this.size_box = '__c_o_m_p_u_t_e__b_b_o_x__ID*';
    this.drag_line = '__d_r_a_g__l_i_n_e__ID*';
    this.drag_rect = '__d_r_a_g__r_e_c_t__ID*';
    let id = 't_r_i_a_n_g_l_e__t_i_p__ID*';
    this.triangle = `url(#${id})`;
    this.addMarker(defs, id, tri, 8, this.palette.node_rim);
    id = 'a_c_t_i_v_e__t_r_i_a_n_g_l_e__t_i_p__ID*';
    this.active_triangle = `url(#${id})`;
    this.addMarker(defs, id, tri, 8, this.palette.active_process);
    id = 'a_c_t_i_v_e__r_e_v__t_r_i__t_i_p__ID*';
    this.active_reversed_triangle = `url(#${id})`;
    this.addMarker(defs, id, tri, 8, this.palette.compound_flow);
    id = 'i_n_a_c_t_i_v_e__t_r_i_a_n_g_l_e__t_i_p__ID';
    this.inactive_triangle = `url(#${id})`;
    this.addMarker(defs, id, tri, 8, 'silver');
    id = 'o_p_e_n__t_r_i_a_n_g_l_e__t_i_p__ID*';
    this.open_triangle = `url(#${id})`;
    this.addMarker(defs, id, tri, 7.5, 'white');
    id = 's_e_l_e_c_t_e_d__t_r_i_a_n_g_l_e__t_i_p__ID*';
    this.selected_triangle = `url(#${id})`;
    this.addMarker(defs, id, tri, 7.5, this.palette.select);
    id = 'w_h_i_t_e__t_r_i_a_n_g_l_e__t_i_p__ID*';
    this.white_triangle = `url(#${id})`;
    this.addMarker(defs, id, tri, 9.5, 'white');
    id = 'c_o_n_g_e_s_t_e_d__t_r_i_a_n_g_l_e__t_i_p__ID*';
    this.congested_triangle = `url(#${id})`;
    this.addMarker(defs, id, tri, 7.5, this.palette.at_process_ub_arrow);
    id = 'd_o_u_b_l_e__t_r_i_a_n_g_l_e__t_i_p__ID*';
    this.double_triangle = `url(#${id})`;
    this.addMarker(defs, id, tri, 12, this.palette.node_rim);
    id = 'a_c_t_i_v_e__d_b_l__t_r_i__t_i_p__ID*';
    this.active_double_triangle = `url(#${id})`;
    this.addMarker(defs, id, tri, 12, this.palette.active_process);
    id = 'i_n_a_c_t_i_v_e__d_b_l__t_r_i__t_i_p__ID*';
    this.inactive_double_triangle = `url(#${id})`;
    this.addMarker(defs, id, tri, 12, 'silver');
    id = 'f_e_e_d_b_a_c_k__t_r_i_a_n_g_l_e__t_i_p__ID*';
    this.feedback_triangle = `url(#${id})`;
    this.addMarker(defs, id, fbt, 10, this.palette.node_rim);
    id = 'c_h_e_v_r_o_n__t_i_p__ID*';
    this.chevron = `url(#${id})`;
    this.addMarker(defs, id, chev, 8, this.palette.node_rim);
    id = 's_e_l_e_c_t_e_d__c_h_e_v_r_o_n__t_i_p__ID*';
    this.selected_chevron = `url(#${id})`;
    this.addMarker(defs, id, chev, 10, this.palette.select);
    id = 'a_c_t_i_v_e__c_h_e_v_r_o_n__t_i_p__ID*';
    this.active_chevron = `url(#${id})`;
    this.addMarker(defs, id, chev, 7, this.palette.at_process_ub);
    id = 'b_l_a_c_k__c_h_e_v_r_o_n__t_i_p__ID*';
    this.black_chevron = `url(#${id})`;
    this.addMarker(defs, id, chev, 6, 'black');
    id = 'o_p_e_n__w_e_d_g_e__t_i_p__ID*';
    this.open_wedge = `url(#${id})`;
    this.addMarker(defs, id, wedge, 9, this.palette.node_rim);
    id = 's_e_l_e_c_t_e_d__o_p_e_n__w_e_d_g_e__t_i_p__ID*';
    this.selected_open_wedge = `url(#${id})`;
    this.addMarker(defs, id, wedge, 11, this.palette.select);
    id = 's_m_a_l_l__o_v_a_l__t_i_p__ID*';
    this.small_oval = `url(#${id})`;
    this.addMarker(defs, id, 'ellipse', 6, this.palette.node_rim);
    id = 's_e_l_e_c_t_e_d__s_m_a_l_l__o_v_a_l__t_i_p__ID*';
    this.selected_small_oval = `url(#${id})`;
    this.addMarker(defs, id, 'ellipse', 8, this.palette.select);
    id = 'a_c_t_i_v_e__s_m_a_l_l__o_v_a_l__t_i_p__ID*';
    this.active_small_oval = `url(#${id})`;
    this.addMarker(defs, id, 'ellipse', 7, this.palette.at_process_ub);
    id = 'b_l_a_c_k__s_m_a_l_l__o_v_a_l__t_i_p__ID*';
    this.black_small_oval = `url(#${id})`;
    this.addMarker(defs, id, 'ellipse', 6, 'black');
    id = 'r__b__g_r_a_d_i_e_n_t__ID*';
    this.red_blue_gradient = `url(#${id})`;
    this.addGradient(defs, id, 'rgb(255,176,176)', 'rgb(176,176,255)');
    id = 'd_o_c_u_m_e_n_t_e_d__ID*';
    this.documented_filter = `filter: url(#${id})`;
    this.addShadowFilter(defs, id, 'rgb(50,120,255)', 2);
    id = 't_a_r_g_e_t__ID*';
    this.target_filter = `filter: url(#${id})`;
    this.addShadowFilter(defs, id, 'rgb(250,125,0)', 8);
    this.svg.appendChild(defs);
    this.changeFont(CONFIGURATION.default_font_name);
  }

  newSVGElement(type, owner=null) {
    // Creates and returns a new SVG element of the specified type
    const el = document.createElementNS(this.svg_url, type);
    if(!el) throw UI.ERROR.CREATE_FAILED;
    // NOTE: by default, SVG elements should not respond to any mouse events!
    if(owner) {
      el.setAttribute('pointer-events', 'auto');
      if(owner instanceof Constraint) {
        el.addEventListener('mouseover',
            () => { UI.setConstraintUnderCursor(owner); });
        el.addEventListener('mouseout',
            () => { UI.setConstraintUnderCursor(null); });
      }
    } else {
      el.setAttribute('pointer-events', 'none');
    }
    return el;
  }
  
  clearSVGElement(el) {
    // Clears all sub-nodes of the specified SVG node
    if(el) while(el.lastChild) el.removeChild(el.lastChild);
  }
  
  addSVGAttributes(el, obj) {
    // Adds attributes specified by `obj` to (SVG) element `el`
    for(let prop in obj) {
      if(obj.hasOwnProperty(prop)) el.setAttribute(prop, obj[prop]);
    }
  }
  
  addMarker(defs, mid, mpath, msize, mcolor) {
    // Defines SVG for markers used to draw arrows and bound lines
    const marker = this.newSVGElement('marker');
    let shape = null;
    this.addSVGAttributes(marker,
        {id: mid, viewBox: '0,0 10,10', markerWidth: msize, markerHeight: msize,
            refX: 5, refY: 5, orient: 'auto-start-reverse',
            markerUnits: 'userSpaceOnUse', fill: mcolor});
    if(mpath == 'ellipse') {
      shape = this.newSVGElement('ellipse');
      this.addSVGAttributes(shape,
          {cx: 5, cy: 5, rx: 4, ry: 4, stroke: 'none'});
    } else {
      shape = this.newSVGElement('path');
      shape.setAttribute('d', mpath);
    }
    shape.setAttribute('stroke-linecap', 'round');
    marker.appendChild(shape);
    defs.appendChild(marker);
  }
  
  addGradient(defs, gid, color1, color2) {
    const gradient = this.newSVGElement('linearGradient');
    this.addSVGAttributes(gradient,
        {id: gid, x1: '0%', y1: '0%', x2: '100%', y2: '0%'});
    let stop = this.newSVGElement('stop');
    this.addSVGAttributes(stop,
        {offset: '0%', style: 'stop-color:' + color1 + ';stop-opacity:1'});
    gradient.appendChild(stop);
    stop = this.newSVGElement('stop');
    this.addSVGAttributes(stop,
        {offset: '100%', style:'stop-color:' + color2 + ';stop-opacity:1'});
    gradient.appendChild(stop);
    defs.appendChild(gradient);
  }
  
  addShadowFilter(defs, fid, color, radius) {
    // Defines SVG for filters used to highlight elements
    const filter = this.newSVGElement('filter');
    this.addSVGAttributes(filter, {id: fid, filterUnits: 'userSpaceOnUse'});
    const sub = this.newSVGElement('feDropShadow');
    this.addSVGAttributes(sub,
        {dx:0, dy:0, 'flood-color': color, 'stdDeviation': radius});
    filter.appendChild(sub);
    defs.appendChild(filter);
  }
  
  addShadowFilter2(defs, fid, color, radius) {
    // Defines SVG for more InkScape compatible filters used to highlight elements
    const filter = this.newSVGElement('filter');
    this.addSVGAttributes(filter, {id: fid, filterUnits: 'userSpaceOnUse'});
    let sub = this.newSVGElement('feGaussianBlur');
    this.addSVGAttributes(sub, {'in': 'SourceAlpha', 'stdDeviation': radius});
    filter.appendChild(sub);
    sub = this.newSVGElement('feOffset');
    this.addSVGAttributes(sub, {dx: 0, dy: 0, result: 'offsetblur'});
    filter.appendChild(sub);
    sub = this.newSVGElement('feFlood');
    this.addSVGAttributes(sub, {'flood-color': color, 'flood-opacity': 1});
    filter.appendChild(sub);
    sub = this.newSVGElement('feComposite');
    this.addSVGAttributes(sub, {in2: 'offsetblur', operator: 'in'});
    filter.appendChild(sub);
    const merge = this.newSVGElement('feMerge');
    sub = this.newSVGElement('feMergeNode');
    merge.appendChild(sub);
    sub = this.newSVGElement('feMergeNode');
    this.addSVGAttributes(sub, {'in': 'SourceGraphic'});
    merge.appendChild(sub);
    filter.appendChild(merge);
    defs.appendChild(filter);
  }
  
  changeFont(fn) {
    // For efficiency, this computes for all integer font sizes up to 16 the
    // height (in pixels) of a string, and also the relative font weight factors 
    // (relative to the normal font weight 400)
    this.font_name = fn;
    this.font_heights = [0];
    this.weight_factors = [0];
    // Get the SVG element used for text size computation
    const el = this.getSizingElement();
    // Set the (new) font name
    el.style.fontFamily = this.font_name;
    el.style.fontWeight = 400;
    // Calculate height and average widths for font sizes 1, 2, ... 16 px
    for(let i = 1; i <= 16; i++) {
      el.style.fontSize = i + 'px';
      // Use characters that probably affect height the most
      el.textContent = '[hq_|';
      this.font_heights.push(el.getBBox().height);
    }
    // Approximate how the font weight will impact string length relative
    // to normal. NOTE: only for 8px font, as this is the default size
    el.style.fontSize = '8px';
    // NOTE: Use a sample of most frequently used characters (digits!)
    // to estimate width change
    el.textContent = '0123456789%+-=<>.';
    const w400 = el.getBBox().width;
    for(let i = 1; i < 10; i++) {
      el.style.fontWeight = 100*i;
      this.weight_factors.push(el.getBBox().width / w400);
    }
  }

  numberSize(number, fsize=8, fweight=400) {
    // Returns the boundingbox {width: ..., height: ...} of a numerical
    // string (in pixels)
    // NOTE: this routine is about 500x faster than textSize because it
    // does not use the DOM tree
    // NOTE: using parseInt makes this function robust to font sizes passed
    // as strings (e.g., "10px")
    fsize = parseInt(fsize);
    // NOTE: 'number' may indeed be a number, so concatenate with '' to force
    // it to become a string
    const
        ns = '' + number,
        fh = this.font_heights[fsize],
        fw = fh / 2;
    let w = 0, m = 0;
    // Approximate the width of the Unicode characters representing
    // special values
    if(ns === '\u2047') {
      w = 8; // undefined (??)
    } else if(ns === '\u25A6' || ns === '\u2BBF' || ns === '\u26A0') {
      w = 6; // computing, not computed, warning sign
    } else {
      // Assume that number has been rendered with fixed spacing
      // (cf. addNumber method of class Shape)
      w = ns.length * fw;
      // Decimal point and minus sign are narrower
      if(ns.indexOf('.') >= 0) w -= 0.6 * fw;
      if(ns.startsWith('-')) w -= 0.55 * fw;
      // Add approximate extra length for =, % and special Unicode characters
      if(ns.indexOf('=') >= 0) {
        w += 0.2 * fw;
      } else {
        // LE, GE, undefined (??), or INF are a bit wider
        m = ns.match(/%|\u2264|\u2265|\u2047|\u221E/g);
        if(m) {
          w += m.length * 0.25 * fw;
        }
        // Ellipsis (may occur between process bounds) is much wider
        m = ns.match(/\u2026/g);
        if(m) w += m.length * 0.6 * fw;
      }
    }
    // adjust for font weight
    return {width: w * this.weight_factors[Math.round(fweight / 100)],
        height: fh};
  }
  
  textSize(string, fsize=8, fweight=400) {
    // Returns the boundingbox {width: ..., height: ...} of a string (in pixels) 
    // NOTE: uses the invisible SVG element that is defined specifically
    // for text size computation
    // NOTE: text size calculation tends to slightly underestimate the
    // length of the string as it is actually rendered, as font sizes
    // appear to be rounded to the nearest available size.
    const el = this.getSizingElement();
    // Accept numbers and strings as font sizes -- NOTE: fractions are ignored!
    el.style.fontSize = parseInt(fsize) + 'px';
    el.style.fontWeight = fweight;
    el.style.fontFamily = this.font_name;
    let w = 0,
        h = 0;
    // Consider the separate lines of the string
    const
        lines = ('' + string).split('\n'),  // Add '' in case string is a number
        ll = lines.length;
    for(let i = 0; i < ll; i++) {
      el.textContent = lines[i];
      const bb = el.getBBox();
      w = Math.max(w, bb.width);
      h += bb.height;
    }
    return {width: w, height: h};
  }
  
  removeInvisibleSVG() {
    // Removes SVG elements used by the user interface (not part of the model)
    let el = document.getElementById(this.size_box);
    if(el) this.svg.removeChild(el);
    el = document.getElementById(this.drag_line);
    if(el) this.svg.removeChild(el);
    el = document.getElementById(this.drag_rect);
    if(el) this.svg.removeChild(el);
  }

  getSizingElement() {
    // Returns the SVG sizing element, or creates it if not found
    let el = document.getElementById(this.size_box);
    // Create it if not found
    if(!el) {
      // Append an invisible text element to the SVG
      el = document.createElementNS(this.svg_url, 'text');
      if(!el) throw UI.ERROR.CREATE_FAILED;
      el.id = this.size_box;
      el.style.opacity = 0;
      this.svg.appendChild(el);
    }
    return el;
  }

  fitToSize() {
    // Adjust the dimensions of the main SVG to fit the graph plus 15px margin
    // all around
    this.removeInvisibleSVG();
    const
        bb = this.svg.getBBox(),
        w = bb.width + 30,
        h = bb.height + 30;
    if(w !== this.width || h !== this.height) {
      MODEL.translateGraph(-bb.x + 15, -bb.y + 25);
      this.width = w;
      this.height = h;
      this.svg.setAttribute('width', this.width);
      this.svg.setAttribute('height', this.height);
      this.zoom_factor = 1;
      this.zoom_label.innerHTML = Math.round(100 / this.zoom_factor) + '%';
      this.extend();
    }
  }

  extend() {
    // Adjust the paper size to fit all objects WITHOUT changing the origin (0, 0)
    // NOTE: keep a minimum page size to keep the scrolling more "natural"
    this.removeInvisibleSVG();
    const
        bb = this.svg.getBBox(),
        // Let `w` and `h` be the actual width and height in pixels
        w = bb.x + bb.width + 30,
        h = bb.y + bb.height + 30,
        // Let `ccw` and `cch` be the size of the scrollable area
        ccw = w / this.zoom_factor,
        cch = h / this.zoom_factor;
    if(this.zoom_factor >= 1) {
      this.width = w;
      this.height = h;
      this.svg.setAttribute('width', this.width);
      this.svg.setAttribute('height', this.height);
      // Reduce the image by making the view box larger than the paper
      const
          zw = w * this.zoom_factor,
          zh = h * this.zoom_factor;
      this.svg.setAttribute('viewBox', ['0 0', zw, zh].join(' '));
    } else {
      // Enlarge the image by making paper larger than the viewbox...
      this.svg.setAttribute('width', ccw / this.zoom_factor);
      this.svg.setAttribute('height', cch / this.zoom_factor);
      this.svg.setAttribute('viewBox', ['0 0', ccw, cch].join(' '));
    }
    // ... while making the scrollable area smaller (if ZF > 1)
    // c.q. larger (if ZF < 1)
    this.container.style.width = (this.width / this.zoom_factor) + 'px';
    this.container.style.height = (this.height / this.zoom_factor) + 'px';
  }
  
  //
  // ZOOM functionality
  //

  doZoom(z) {
    this.zoom_factor *= Math.sqrt(z);
    document.getElementById('zoom').innerHTML =
        Math.round(100 / this.zoom_factor) + '%';
    this.extend();
  }
  
  zoomIn() {
    if(UI.buttons.zoomin && !UI.buttons.zoomin.classList.contains('disab')) {
      // Enlarging graph by more than 200% would seem not functional
      if(this.zoom_factor > 0.55) this.doZoom(0.5);
    }
  }
  
  zoomOut() {
    if(UI.buttons.zoomout && !UI.buttons.zoomout.classList.contains('disab')) {
      // Reducing graph by to less than 25% would seem not functional
      if(this.zoom_factor <= 4) this.doZoom(2);
    }
  }
  
  cursorPosition(x, y) {
    // Returns [x, y] in diagram coordinates
    const
        rect = this.container.getBoundingClientRect(),
        top = rect.top + window.scrollY + document.body.scrollTop, 
        left = rect.left + window.scrollX + document.body.scrollLeft;
    x = Math.max(0, Math.floor((x - left) * this.zoom_factor));
    y = Math.max(0, Math.floor((y - top) * this.zoom_factor));
    return [x, y];
  }

  //
  // Metods for visual feedback while linking or selecting
  //

  dragLineToCursor(node, x, y) {
    // NOTE: does not remove element; only updates path and opacity
    let el = document.getElementById(this.drag_line);
    // Create it if not found
    if(!el) {
      el = this.newSVGElement('path');
      el.id = this.drag_line;
      el.style.opacity = 0;
      el.style.fill = 'none';
      el.style.stroke = 'red';
      el.style.strokeWidth = 1.5;
      el.style.strokeDasharray = UI.sda.dash;
      this.svg.appendChild(el);
    }
    el.setAttribute('d', `M${node.x},${node.y}l${x - node.x},${y - node.y}`);
    el.style.opacity = 1;
    this.adjustPaperSize(x, y);
  }
  
  adjustPaperSize(x, y) {
    if(this.zoom_factor < 1) return;
    const
        w = parseFloat(this.svg.getAttribute('width')),
        h = parseFloat(this.svg.getAttribute('height'));
    if(x <= w && y <= h) return;
    if(x > w) {
      this.svg.setAttribute('width', x);
      this.width = x;
      this.container.style.width = (x / this.zoom_factor) + 'px';
    }
    if(y > h) {
      this.svg.setAttribute('height', y);
      this.height = y;
      this.container.style.height = (y / this.zoom_factor) + 'px';
    }
    this.svg.setAttribute('viewBox',
        ['0 0', this.width * this.zoom_factor,
            this.height * this.zoom_factor].join(' '));
  }
  
  hideDragLine() {
    const el = document.getElementById(this.drag_line);
    if(el) el.style.opacity = 0;
  }

  dragRectToCursor(ox, oy, dx, dy) {
    // NOTE: does not remove element; only updates path and opacity
    let el = document.getElementById(this.drag_rect);
    // Create it if not found
    if(!el) {
      el = this.newSVGElement('rect');
      el.id = this.drag_rect;
      el.style.opacity = 0;
      el.style.fill = 'none';
      el.style.stroke = 'red';
      el.style.strokeWidth = 1.5;
      el.style.strokeDasharray = UI.sda.dash;
      el.setAttribute('rx', 0);
      el.setAttribute('ry', 0);
      this.svg.appendChild(el);
    }
    let lx = Math.min(ox, dx),
        ty = Math.min(oy, dy),
        rx = Math.max(ox, dx),
        by = Math.max(oy, dy);
    el.setAttribute('x', lx);
    el.setAttribute('y', ty);
    el.setAttribute('width', rx - lx);
    el.setAttribute('height', by - ty);
    el.style.opacity = 1;
    this.adjustPaperSize(rx, by);
  }
  
  hideDragRect() {
    const el = document.getElementById(this.drag_rect);
    if(el) { el.style.opacity = 0; }
  }
  
  //
  //  Auxiliary methods used while drawing shapes
  //
  
  arc(r, srad, erad) {
    // Returns SVG path code for an arc having radius `r`, start angle `srad`,
    // and end angle `erad`
    return 'a' + [r, r, 0, 0, 1, r * Math.cos(erad) - r * Math.cos(srad),
        r * Math.sin(erad) - r * Math.sin(srad)].join(',');
  }

  bezierPoint(a, b, c, d, t) {
    // Returns the point on a cubic Bezier curve from `a` to `b` with control
    // points `c` and `d`, and `t` indicating the relative distance from `a`
    // as a fraction between 0 and 1. NOTE: the four points must be represented
    // as lists [x, y]
    function interPoint(a, b, t) {
      // Local function that performs linear interpolation between two points
      // `a` = [x1, y1] and `b` = [x2, y2] when parameter `t` indicates
      // the relative distance from `a` as afraction between 0 and 1
      return  [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    }
    // Calculate the Bezier points
    const ab = interPoint(a, b, t),
          bc = interPoint(b, c, t),
          cd = interPoint(c, d, t);
    return interPoint(interPoint(ab, bc, t), interPoint(bc, cd, t), t);
  }

  relDif(n1, n2) {
    // Returns the relative difference (n1 - n2) / |n2| unless n2 is
    // near-zero; then it returns the absolute difference n1 - n2
    const div = Math.abs(n2);
    if(div < VM.NEAR_ZERO) {
      return n1 - n2;
    }
    return (n1 - n2) / div;
  }
  
  //
  // Diagram-drawing method draws the diagram for the focal cluster
  //
  
  drawModel(mdl) {
    // Draw the diagram for the focal cluster
    this.clear();
    // Prepare to draw all elements in the focal cluster
    const fc = mdl.focal_cluster;
    fc.categorizeEntities();
    // NOTE: product positions must be updated before links are drawn
    fc.positionProducts();
    for(let i = 0; i < fc.processes.length; i++) {
      fc.processes[i].clearHiddenIO();
    }
    for(let i = 0; i < fc.sub_clusters.length; i++) {
      fc.sub_clusters[i].clearHiddenIO();
    }
    // Draw link arrows and constraints first, as all other entities are
    // slightly transparent so they cannot completely hide these lines
    for(let i = 0; i < fc.arrows.length; i++) {
      this.drawArrow(fc.arrows[i]);
    }
    for(let i = 0; i < fc.related_constraints.length; i++) {
      this.drawConstraint(fc.related_constraints[i]);
    }
    for(let i = 0; i < fc.processes.length; i++) {
      this.drawProcess(fc.processes[i]);
    }
    for(let i = 0; i < fc.product_positions.length; i++) {
      this.drawProduct(fc.product_positions[i].product);
    }
    for(let i = 0; i < fc.sub_clusters.length; i++) {
      this.drawCluster(fc.sub_clusters[i]);
    }
    // Draw notes last, as they are semi-transparent (and can be quite small)
    for(let i = 0; i < fc.notes.length; i++) {
      this.drawNote(fc.notes[i]);
    }
    // Resize paper if necessary
    this.extend();
  }
  
  drawSelection(mdl, dx=0, dy=0) {
    // NOTE: Clear this global, as Bezier curves move from under the cursor
    // without a mouseout event 
    this.constraint_under_cursor = null;
    // Draw the selected entities and associated links, and also constraints
    for(let i = 0; i < mdl.selection.length; i++) {
      const obj = mdl.selection[i];
      // Links and constraints are drawn separately, so do not draw those
      // contained in the selection 
      if(!(obj instanceof Link || obj instanceof Constraint)) {
        UI.drawObject(obj, dx, dy);
      }
    }
    if(mdl.selection_related_arrows.length === 0) {
      mdl.selection_related_arrows = mdl.focal_cluster.selectedArrows();
    }
    // Only draw the arrows that relate to the selection
    for(let i = 0; i < mdl.selection_related_arrows.length; i++) {
      this.drawArrow(mdl.selection_related_arrows[i]);
    }
    // As they typically are few, simply redraw all constraints that relate to
    // the focal cluster
    for(let i = 0; i < mdl.focal_cluster.related_constraints.length; i++) {
      this.drawConstraint(mdl.focal_cluster.related_constraints[i]);
    }
    this.extend(); 
  }

  
  //
  // Shape-drawing methods for model entities
  //

  drawArrow(arrw, dx=0, dy=0) {
    // Draws an arrow from FROM nodebox to TO nodebox
    // NOTE: first erase previously drawn arrow
    arrw.shape.clear();
    arrw.hidden_nodes.length = 0;
    // Use local variables so as not to change any "real" attribute values
    let cnb, proc, prod, fnx, fny, fnw, fnh, tnx, tny, tnw, tnh,
        cp, rr, aa, bb, dd, nn, af, l, s, w, tw, th, bpx, bpy, epx, epy,
        sda, stroke_color, stroke_width, arrow_start, arrow_end,
        font_color, font_weight, luc = null;
    // Get the main arrow attributes
    const
        from_nb = arrw.from_node,
        to_nb = arrw.to_node;
    // Use "let" because `ignored` may also be set later on (for single link)
    let ignored = (from_nb && MODEL.ignored_entities[from_nb.identifier]) ||
        (to_nb && MODEL.ignored_entities[to_nb.identifier]);
    // First check if this is a block arrow (ONE node being null)
    if(!from_nb) {
      cnb = to_nb;
    } else if(!to_nb) {
      cnb = from_nb;
    } else {
      cnb = null;
    }
    // If not NULL `cnb` is the cluster or node box (product or process) having
    // links to entities outside the focal cluster. Such links are summarized
    // by "block arrows": on the left edge of the box to indicate inflows,
    // on the right edge to indicate outflows, and two-headed on the top edge
    // to indicate two-way flows. When the cursor is moved over a block arrow,
    // the Documentation dialog will display the list of associated nodes
    // (with their actual flows if non-zero)
    if(cnb) {
      // Distinguish between input, output and io products
      let ip = [], op = [], iop = [];
      if(cnb instanceof Cluster) {
        for(let i = 0; i < arrw.links.length; i++) {
          const lnk = arrw.links[i];
          // determine which product is involved
          prod = (lnk.from_node instanceof Product ? lnk.from_node : lnk.to_node);
          // NOTE: clusters "know" their input/output products
          if(cnb.io_products.indexOf(prod) >= 0) {
            addDistinct(prod, iop);
          } else if(cnb.consumed_products.indexOf(prod) >= 0) {
            addDistinct(prod, ip);
          } else if(cnb.produced_products.indexOf(prod) >= 0) {
            addDistinct(prod, op);
          }
        }
      } else {
        // cnb is process or product => knows its inputs and outputs
        for(let i = 0; i < arrw.links.length; i++) {
          const lnk = arrw.links[i];
          if(lnk.from_node === cnb) {
            addDistinct(lnk.to_node, op);
          } else {
            addDistinct(lnk.from_node, ip);
          }
          // NOTE: for processes, products cannot be BOTH input and output
        }
      }
      cnb.hidden_inputs = ip;
      cnb.hidden_outputs = op;
      cnb.hidden_io = iop;
      return true;
    } // end of IF "block arrow"
    
    // Arrows having both "from" and "to" are displayed as "real" arrows
    // The hidden nodes list must contain the nodes that have no position
    // in the cluster being drawn
    // NOTE: products are "hidden" typically when this arrow represents multiple
    // links, but also if it is a single link from a cluster to a process
    const
        from_c = from_nb instanceof Cluster,
        to_c = to_nb instanceof Cluster,
        from_p = from_nb instanceof Process,
        to_p = to_nb instanceof Process;
    let data_flows = 0;
    if(arrw.links.length > 1 || (from_c && to_p) || (from_p && to_c)) {
      for(let i = 0; i < arrw.links.length; i++) {
        const
            lnk = arrw.links[i],
            fn = lnk.from_node,
            tn = lnk.to_node;
        if(fn instanceof Product && fn != from_nb && fn != to_nb) {
          // Add node only if they not already shown at EITHER end of the arrow
          addDistinct(fn, arrw.hidden_nodes);
          // Count number of data flows represented by arrow
          if(tn.is_data) data_flows++;
        }
        // NOTE: no ELSE IF, because BOTH link nodes can be products
        if(tn instanceof Product && tn != from_nb && tn != to_nb)  {
          addDistinct(tn, arrw.hidden_nodes);
          // Count number of data flows represented by arrow
          if(fn.is_data) data_flows++;
        }
      }
    }

    // NEXT: some more local variables
    fnx = from_nb.x + dx;
    fny = from_nb.y + dy;
    fnw = from_nb.width;
    fnh = from_nb.height;
    tnx = to_nb.x + dx;
    tny = to_nb.y + dy;
    tnw = to_nb.width;
    tnh = to_nb.height;
    // Processes and clusters may have been collapsed to small rectangles
    if(from_p && from_nb.collapsed) {
      fnw = 17;
      fnh = 12;
    } else if(from_c && from_nb.collapsed) {
      fnw = 24;
      fnh = 24;
    }
    if(to_p && to_nb.collapsed) {
      tnw = 17;
      tnh = 12;
    } else if(to_c && to_nb.collapsed) {
      tnw = 24;
      tnh = 24;
    }
    
    // Do not draw arrow if so short that it is hidden by its FROM and TO nodes
    if((Math.abs(fnx - tnx) < (fnw + tnw)/2) &&
       (Math.abs(fny - tny) <= (fnh + tnh)/2)) {
      return false;
    }
    
    // Adjust node heights if nodes are thick-rimmed
    if((from_nb instanceof Product) && from_nb.is_buffer) fnh += 2;
    if((to_nb instanceof Product) && to_nb.is_buffer) tnh += 2;
    // Get horizontal distance dx and vertical distance dy of the node centers
    dx = tnx - fnx;
    dy = tny - fny;
    // If dx is less than half a pixel, draw a vertical line
    if(Math.abs(dx) < 0.5) {
      arrw.from_x = fnx;
      arrw.to_x = fnx;
      if(dy > 0) {
        arrw.from_y = fny + fnh/2;
        arrw.to_y = tny - tnh/2;
      } else {
        arrw.from_y = fny - fnh/2;
        arrw.to_y = tny + tnh/2;
      }
    } else {
      // Now dx > 0, so no division by zero can occur when calculating dy/dx
      // First compute X and Y of tail (FROM node)
      w = (from_nb instanceof Product ? from_nb.frame_width : fnw);
      if(Math.abs(dy / dx) >= Math.abs(fnh / w)) {
        // Arrow connects to horizontal edge
        arrw.from_y = (dy > 0 ? fny + fnh/2 : fny - fnh/2);
        arrw.from_x = fnx + fnh/2 * dx / Math.abs(dy);
      } else if(from_nb instanceof Product) {
        // Box with semicircular sides
        fnw = from_nb.frame_width;
        rr = (fnh/2) * (fnh/2);  // R square
        aa = (dy / dx) * (dy / dx);  // A square
        dd = fnw/2;
        nn = (-dd - Math.sqrt(rr - aa * dd * dd + aa * rr)) / (1 + aa);
        if(dx > 0) {
          // link points towards the right
          arrw.from_x = fnx - nn;
          arrw.from_y = fny - nn * dy / dx;
        } else {
          arrw.from_x = fnx + nn;
          arrw.from_y = fny + nn * dy / dx;
        }
      } else {
        // Rectangular box
        arrw.from_x = (dx > 0 ? fnx + w/2 : fnx - w/2);
        arrw.from_y = fny + w/2 * dy / Math.abs(dx);
      }
      // Then compute X and Y of head (TO node)
      w = (to_nb instanceof Product ? to_nb.frame_width : tnw);
      dx = arrw.from_x - tnx;
      dy = arrw.from_y - tny;
      if(Math.abs(dx) > 0) {
        if(Math.abs(dy / dx) >= Math.abs(tnh / w)) {
          // Connects to horizontal edge
          arrw.to_y = (dy > 0 ? tny + tnh/2 : tny - tnh/2);
          arrw.to_x = tnx + tnh/2 * dx / Math.abs(dy);
        } else if(to_nb instanceof Product) {
          // Node with semicircular sides}
          tnw = to_nb.frame_width;
          rr = (tnh/2) * (tnh/2);  // R square
          aa = (dy / dx) * (dy / dx);  // A square
          dd = tnw/2;
          nn = (-dd - Math.sqrt(rr - aa*(dd*dd - rr))) / (1 + aa);
          if(dx > 0) {
            // Link points towards the right
            arrw.to_x = tnx - nn;
            arrw.to_y = tny - nn * dy / dx;
          } else {
            arrw.to_x = tnx + nn;
            arrw.to_y = tny + nn * dy / dx;
          }
        } else {
          // Rectangular node
          arrw.to_x = (dx > 0 ? tnx + w/2 : tnx - w/2);
          arrw.to_y = tny + w/2 * dy / Math.abs(dx);
        }
      }
    }

    // Assume default arrow properties
    sda = 'none';
    stroke_color = (ignored ? this.palette.ignore : this.palette.node_rim);
    stroke_width = 1.5;
    arrow_start = 'none';
    arrow_end = this.triangle;
    // Default multi-flow values are: NO multiflow, NOT congested or reversed
    let mf = [0, 0, 0, false, false],
        reversed = false;
    // These may need to be modified due to actual flow, etc.
    if(arrw.links.length === 1) {
      // Display link properties of a specific link if arrow is plain
      luc = arrw.links[0];
      ignored = MODEL.ignored_entities[luc.identifier];
      if(MODEL.solved && !ignored) {
        // Draw arrow in dark blue if a flow occurs, or in a lighter gray
        // if NO flow occurs
        af = luc.actualFlow(MODEL.t);
        if(Math.abs(af) > VM.SIG_DIF_FROM_ZERO) {
          // NOTE: negative flow should affect arrow heads only when link has
          // default multiplier AND connects to a process
          if(af < 0 && luc.multiplier === VM.LM_LEVEL &&
              (luc.from_node instanceof Process ||
                  luc.to_node instanceof Process)) {
            reversed = true;
            stroke_color = this.palette.compound_flow;
            arrow_end = this.active_reversed_triangle;
          } else {
            stroke_color = this.palette.active_process;
            arrow_end = this.active_triangle;
          }
        } else {
          stroke_color = (MODEL.ignored_entities[luc.identifier] ?
              this.palette.ignore : 'silver');
          arrow_end = this.inactive_triangle;
        }
      } else {
        af = VM.UNDEFINED;
      }
      if(luc.from_node instanceof Process) {
        proc = luc.from_node;
        prod = luc.to_node;
      } else {
        proc = luc.to_node;
        prod = luc.from_node;
      }
      // NOTE: `luc` may also be a constraint!
      if(luc instanceof Link && luc.is_feedback) {
        sda = UI.sda.long_dash_dot;
        arrow_end = this.feedback_triangle;
      }
      // Data link => dotted line
      if(luc.dataOnly) {
        sda = UI.sda.dot;
      }
      if(luc.selected) {
        // Draw arrow line thick and in red
        stroke_color = this.palette.select;
        stroke_width = 2;
        if(arrow_end == this.open_wedge) {
          arrow_end = this.selected_open_wedge;
        } else {
          arrow_end = this.selected_triangle;
        }
      }
      if(ignored) stroke_color = this.palette.ignore;
    } else {
      // A composite arrow is visualized differently, depending on the number
      // of related products and the direction of the underlying links:
      //  - if only ONE product, the arrow is plain UNLESS both end nodes are
      //    processes; then the arrow is dashed to highlight that it is special
      //  - if multiple data flows (product-to-product) the arrow is dashed
      //  - if multiple products, the arrow is drawn with a double line ===>
      //  - if the links do not all flow in the same direction, the arrow has
      //    two heads
      // NOTE: the hidden nodes have already been computed because
      //       they are also used outside this ELSE clause
      if(arrw.hidden_nodes.length > 1) {
        stroke_width = 3;
        arrow_end = this.double_triangle;
      }
      // Draw arrows between two processes or two products using dashed lines
      if((from_nb instanceof Process && to_nb instanceof Process) ||
         (from_nb instanceof Product && to_nb instanceof Product)) {
        sda = UI.sda.dash;
      }
      // Bidirectional => also an arrow head at start point
      if(arrw.bidirectional) arrow_start = arrow_end;
    }
    // Correct the start and end points of the shaft for the stroke width
    // and size and number of the arrow heads
    // NOTE: re-use of dx and dy for different purpose!
    dx = arrw.to_x - arrw.from_x;
    dy = arrw.to_y - arrw.from_y;
    l = Math.sqrt(dx * dx + dy * dy);
    let cdx = 0, cdy = 0;
    if(l > 0) {
      // Amount to shorten the line to accommodate arrow head
      // NOTE: for thicker arrows, subtract a bit more
      cdx = (4 + 1.7 * (stroke_width - 1.5)) * dx / l;
      cdy = (4 + 1.7 * (stroke_width - 1.5)) * dy / l;
    }
    if(reversed) {
      // Adjust end points by 1/2 px for rounded stroke end
      bpx = arrw.to_x - 0.5*dx / l;
      bpy = arrw.to_y - 0.5*dy / l;
      // Adjust start points for arrow head(s)
      epx = arrw.from_x + cdx;
      epy = arrw.from_y + cdy;
      if(arrw.bidirectional) {
        bpx -= cdx;
        bpy -= cdy;
      }
    } else {
      // Adjust start points by 1/2 px for rounded stroke end
      bpx = arrw.from_x + 0.5*dx / l;
      bpy = arrw.from_y + 0.5*dy / l;
      // Adjust end points for arrow head(s)
      epx = arrw.to_x - cdx;
      epy = arrw.to_y - cdy;
      if(arrw.bidirectional) {
        bpx += cdx;
        bpy += cdy;
      }
    }
    // Calculate actual (multi)flow, as this co-determines the color of the arrow
    if(MODEL.solved) {
      if(!luc) {
        mf = arrw.multiFlows;
        af = mf[1] + mf[2];
      }
      if(Math.abs(af) > VM.SIG_DIF_FROM_ZERO && stroke_color != this.palette.select) {
        stroke_color = this.palette.active_process;
        if(arrow_end === this.double_triangle) {
          arrow_end = this.active_double_triangle;
        } else if(reversed) {
          stroke_color = this.palette.compound_flow;
          arrow_end = this.active_reversed_triangle;
        } else {
          arrow_end = this.active_triangle;
        }
        if(arrw.bidirectional) {
          arrow_start = arrow_end;
        }          
      } else {
        if(stroke_color != this.palette.select) stroke_color = 'silver';
        if(arrow_end === this.double_triangle) {
          arrow_end = this.inactive_double_triangle;
          if(arrw.bidirectional) {
            arrow_start = this.inactive_double_triangle;
          }
        }
      }
    } else {
      af = VM.UNDEFINED;
    }

    // Draw arrow shaft
    if(stroke_width === 3 && data_flows) {
      // Hollow shaft arrow: dotted when *all* represented links are
      // data links, dashed when some links are regular links
      sda = (data_flows === arrw.hidden_nodes.length ? '3,2' : '8,3');
    }
    arrw.shape.addPath(['M', bpx, ',', bpy, 'L', epx, ',', epy],
        {fill: 'none', stroke: stroke_color,
          'stroke-width': stroke_width, 'stroke-dasharray': sda,
          'stroke-linecap': (stroke_width === 3 ? 'butt' : 'round'),
          'marker-end': arrow_end, 'marker-start': arrow_start,
          'marker-fill': stroke_color,
          'style': (DOCUMENTATION_MANAGER.visible && arrw.hasComments ?
               this.documented_filter : '')});
    // For compound arrow, add a thin white stripe in the middle to
    // suggest a double line
    if(stroke_width === 3) {
      const fclr = (mf[3] || mf[4] ? this.palette.at_process_ub : 'white');
      arrow_end = (mf[4] ? this.congested_triangle :
          this.white_triangle);
      // NOTE: adjust end points to place white arrowheads nicely
      // in the larger ones
      epx -= 0.1*cdx;
      epy -= 0.1*cdy;
      if(arrow_start !== 'none') {
        arrow_start = (mf[3] ? this.congested_triangle :
            this.white_triangle);
        bpx += 0.1*cdx;
        bpy += 0.1*cdy;
      }
      const format = {stroke: (data_flows ? 'white' : fclr),
          'stroke-width': 1.5, 'stroke-linecap': 'butt',
          'marker-end': arrow_end, 'marker-start': arrow_start
        };
      arrw.shape.addPath(['M', bpx, ',', bpy, 'L', epx, ',',  epy],
          format);
    }

    // NEXT: draw data fields (if single link) only if arrow has a length
    // l > 0 (this check also protects against division by 0)
    if(luc && l > 0) {
      // NOTE: "shift" is the distance in pixels from the arrow tip to the
      //       first "empty" spot on the shaft
      // The arrow head takes about 7 pixels, or 9 when link is selected
      let head = (luc.selected || luc.is_feedback ? 9 : 7),
          headshift = head,
          // Add 2px margin
          shift = 2;
      const lfd = (luc.actualDelay(MODEL.t));
      if(lfd > 0) {
        // If delay, draw it in a circle behind arrow head
        s = lfd;
        bb = this.numberSize(s, 7);
        // The circle radius should accomodate the text both in width and height
        tw = Math.max(bb.width, bb.height) / 2 + 0.5;
        // shift this amount further down the shaft
        headshift += tw;
        // Draw delay in circle (solid fill with stroke color) 
        epx = arrw.to_x - (shift + headshift) * dx / l;
        epy = arrw.to_y - (shift + headshift) * dy / l;
        arrw.shape.addCircle(epx, epy, tw, {'fill':stroke_color});
        // Draw the delay (integer number of time steps) in white
        arrw.shape.addNumber(epx, epy, s, {'font-size': 7, fill: 'white'});
        // Shift another radius down plus 2px margin 
        shift += tw + 2;
      }

      // Draw the special multiplier symbol if necessary 
      if(luc.multiplier) {
        // Shift circle radius (5px) down the shaft
        headshift += 5;
        epx = arrw.to_x - (shift + headshift) * dx / l;
        epy = arrw.to_y - (shift + headshift) * dy / l;
        arrw.shape.addCircle(epx, epy, 5,
            {stroke:stroke_color, 'stroke-width': 0.5, fill: 'white'});
        // MU symbol does not center prettily => raise by 1 px
        const raise = (luc.multiplier === VM.LM_MEAN ||
            luc.multiplier === VM.LM_THROUGHPUT ? 1 :
                (luc.multiplier === VM.LM_PEAK_INC ? 1.5 : 0));
        arrw.shape.addText(epx, epy - raise, VM.LM_SYMBOLS[luc.multiplier],
            {fill: 'black'});
        // Shift another radius plus 2px margin
        headshift += 7;
      }

      // Draw link rate near head or tail, depending on link type
      // NOTE: take into account the delay (a process outputs at rate[t - delta])  
      s = VM.sig4Dig(luc.relative_rate.result(MODEL.t - lfd));
      const rrfs = (luc.relative_rate.isStatic ? 'normal' : 'italic');
      bb = this.numberSize(s);
      th = bb.height;
      // For small rates (typically 1), the text height will exceed its width
      tw = Math.max(th, bb.width);
      // NOTE: The extra distance ("gap") to keep from the start point varies
      // with abs(dy/l). At most (horizontal, dy = 0) half the width of the
      // number, at least (vertical) half the height. Add 3px margin (partly
      // used inside the text box).
      shift += 3 + th + (tw - th)/2 * (1 - Math.abs(dy/l));
      if(luc.to_node instanceof Process || luc.dataOnly) {
        // Show rate near arrow head, leaving extra room for delay and
        // multiplier circles 
        epx = arrw.to_x - (shift + headshift) * dx / l;
        epy = arrw.to_y - (shift + headshift) * dy / l;
        if(luc.dataOnly) {
          // Show non-negative data multipliers in black, 
          // and negative data multipliers in bright red
          font_color = (s < 0 ? 'red' : 'black');
        } else {
          // "regular" product flows are consumed by the TO-node
          // (being a process)
          font_color = this.palette.consumed;
        }
      } else {
        // Show the rate near the arrow tail (ignore space for arrowhead
        // unless bidirectional)
        const bi = (arrw.bidirectional ? head : 0);
        epx = arrw.from_x + (shift + bi) * dx / l;
        epy = arrw.from_y + (shift + bi) * dy / l;
        font_color = this.palette.produced;
      }
      // Draw the rate in a semi-transparent white ellipse
      arrw.shape.addEllipse(epx, epy, tw/2, th/2, {fill: 'white', opacity: 0.8});
      arrw.shape.addNumber(epx, epy, s, {fill: font_color, 'font-style': rrfs});

      // Draw the share of cost (only if relevant and > 0) behind the rate
      // in a pale yellow filled box
      if(MODEL.infer_cost_prices && luc.share_of_cost > 0) {
        // Keep the right distance from the rate: the midpoint should
        // increase by a varying length: number lengths / 2 when arrow is
        // horizontal, while number heights when arrow is vertical. This is
        // achieved by multiplying the "gap" being (lengths - heights)/2 by
        // (1 - |dy/l|). NOTE: we re-use the values of `th` and `tw`
        // computed in the previous block!
        shift += th / 2;
        s = VM.sig4Dig(luc.share_of_cost * 100) + '%';
        bb = this.numberSize(s, 7);
        const sgap = (tw + bb.width + 3 - th - bb.height) / 2; 
        tw = bb.width + 3;
        th = bb.height + 1;
        shift += 3 + th/2 + sgap * (1 - Math.abs(dy/l));
        // NOTE: if rate is shown near head, just accommodate the SoC box
        if(luc.dataOnly) {
          shift = 5 + th + (tw - th)/2 * (1 - Math.abs(dy/l));
        }
        // Do not draw SoC if arrow is very short
        if(shift < l) {
          epx = arrw.from_x + shift * dx / l;
          epy = arrw.from_y + shift * dy / l;
          arrw.shape.addRect(epx, epy, tw, th,
              {stroke: 'black', 'stroke-width': 0.3,
                  fill: (luc.from_node.totalAttributedCost <= 1 ?
                      this.palette.cost_price : this.palette.soc_too_high),
                  rx: 2, ry: 2});
          arrw.shape.addNumber(epx, epy, s, {fill: 'black'});
        }
      }
    }
    
    // Draw the actual flow
    if(l > 0 && af < VM.UNDEFINED && Math.abs(af) > VM.SIG_DIF_FROM_ZERO) {
      const ffill = {fill:'white', opacity:0.8};
      if(luc || mf[0] == 1) {
        // Draw flow data halfway the arrow only if calculated and non-zero
        s = VM.sig4Dig(af); 
        bb = this.numberSize(s, 10, 700);
        tw = bb.width/2;
        th = bb.height/2;
        // NOTE: for short arrows (less than 100 pixels long) that have data
        // near the head, move the actual flow label further down the shaft
        const pfr = (l < 100 &&
          (luc && (luc.to_node instanceof Process || luc.dataOnly)) ? 0.65 : 0.5);
        epx = arrw.to_x - dx*pfr;
        epy = arrw.to_y - dy*pfr;
        arrw.shape.addEllipse(epx, epy, tw + 2, th, ffill);
        arrw.shape.addNumber(epx, epy, s,
            {fill:stroke_color, 'font-size':10, 'font-weight':700});
      } else if(mf[0] > 1) {
        // Multi-flow arrow with flow data computed
        let clr = this.palette.active_process;
        if(mf[3]) ffill.fill = this.palette.at_process_ub_bar;
        s = VM.sig4Dig(mf[1]); 
        bb = this.numberSize(s, 10, 700);
        tw = bb.width/2;
        th = bb.height/2;
        if(mf[0] == 2) {
          // Single aggregated flow (for monodirectional arrow) in middle
          epx = arrw.to_x - dx*0.5;
          epy = arrw.to_y - dy*0.5;
        } else {
          clr = this.palette.compound_flow;
          // Two aggregated flows: first the tail flow ...
          epx = arrw.to_x - dx*0.75;
          epy = arrw.to_y - dy*0.75;
          // Only display if non-zero
          if(s !== 0) {
            if(ffill.fill !== 'white') {
              arrw.shape.addRect(epx, epy, tw*2, th*2, ffill);
            } else {
              arrw.shape.addEllipse(epx, epy, tw, th, ffill);
            }
            arrw.shape.addNumber(epx, epy, s,
                {fill:clr, 'font-size':10, 'font-weight':700});
          }
          // ... then also the head flow
          s = VM.sig4Dig(mf[2]); 
          bb = this.numberSize(s, 10, 700);
          tw = bb.width/2;
          th = bb.height/2;
          ffill.fill = (mf[4] ? this.palette.at_process_ub_bar : 'white');
          epx += dx*0.5;
          epy += dy*0.5;
        }
        // Only display if non-zero
        if(s !== 0) {
          if(ffill.fill !== 'white') {
            arrw.shape.addRect(epx, epy, tw*2, th*2, ffill);
          } else {
            arrw.shape.addEllipse(epx, epy, tw, th, ffill);
          }
          arrw.shape.addNumber(epx, epy, s,
              {fill:clr, 'font-size':10, 'font-weight':700});
        }
      }
      // For single links, show cost prices of non-zero flows only for
      // non-error, non-infinite actual flows
      if(luc && MODEL.infer_cost_prices &&
         af > VM.MINUS_INFINITY && af < VM.PLUS_INFINITY
        ) {
        // Assume no cost price to be displayed
        s = '';
        let soc = 0;
        // NOTE: flows INTO processes always carry cost
        if(luc.to_node instanceof Process) {
          soc = 1;
          prod = luc.from_node;
          proc = luc.to_node;
        } else {
          if(luc.from_node instanceof Process) {
            soc = luc.share_of_cost;
          }
          prod = luc.to_node;
          proc = luc.from_node;
        }
        // If a link FROM a process carries no cost, the flow has no
        // cost price...
        if(soc === 0) {
          if(luc.to_node.price.defined) {
            cp  = luc.to_node.price.result(MODEL.t);
            // ... unless it is a flow of a by-product having a market
            // value (+ or -)
            if(cp !== 0) {
              //Just in case, check for error codes (if so, display them)
              if(cp < VM.MINUS_INFINITY) {
                s = VM.sig4Dig(cp);
              } else if(cp < 0) {
                s = `(${VM.sig4Dig(af * cp)})`;
              }
            }
          }
        } else {
          if(af > 0) {
            // Positive flow => use cost price of FROM node
            if(luc.from_node instanceof Process) {
              // For processes, this is their cost price per level
              // DIVIDED BY the relative rate of the link
              const rr = luc.relative_rate.result(MODEL.t);
              if(Math.abs(rr) < VM.NEAR_ZERO) {
                cp = (rr < 0 && cp < 0 || rr > 0 && cp > 0 ?
                    VM.PLUS_INFINITY : VM.MINUS_INFINITY);
              } else {
                cp = proc.costPrice(MODEL.t) / rr;
              }
            } else if(prod.price.defined) {
              // For products their market price if defined...
              cp = prod.price.result(MODEL.t);
            } else {
              // ... otherwise their cost price
              cp = prod.costPrice(MODEL.t);
            }
          } else {
            // Negative flow => use cost price of TO node
            if(luc.to_node instanceof Process) {
              cp = proc.costPrice(MODEL.t);
            } else if(prod.price.defined) {
              cp = prod.price.result(MODEL.t);
            } else {
              cp = prod.costPrice(MODEL.t);
            }
          }
          // NOTE: the first condition ensures that error codes will be displayed
          if(cp <= VM.MINUS_INFINITY || cp >= VM.PLUS_INFINITY) {
            s = VM.sig4Dig(cp);
          } else if(Math.abs(cp) <= VM.SIG_DIF_FROM_ZERO) {
            // DO not display CP when it is "propagated" NO_COST
            s = (cp === VM.NO_COST ? '' : '0');
          } else {
            // NOTE: use the absolute value of the flow, as cost is not affected by direction
            s = VM.sig4Dig(Math.abs(af) * soc * cp);
          }
        }
        // Only display cost price if it is meaningful
        if(s) {
          font_color = 'gray';
          bb = this.numberSize(s, 8, font_weight);
          tw = bb.width;
          th = bb.height;
          // NOTE: offset cost price label relative to actual flow label
          epy += th + 1;
          arrw.shape.addRect(epx, epy, tw, th, {'fill': this.palette.cost_price});
          arrw.shape.addNumber(epx, epy, s, {'fill': font_color});
        }
      } // end IF luc and cost prices shown and actual flow not infinite
    } // end IF l > 0 and actual flow is defined and non-zero

    if(l > 0) {
      // NOTE: make the arrow shape nearly transparant when it connects to a
      // product that has the "hide links" option selected
      if(arrw.from_node.no_links || arrw.to_node.no_links) {
        arrw.shape.element.setAttribute('opacity', 0.08);
      }
      arrw.shape.appendToDOM();
      return true;
    }
    // If nothing is drawn, return FALSE although this does NOT imply an error
    return false;
  }
  
  drawConstraint(c) {
    // Draws constraint `c` on the paper
    let from_ctrl,
        to_ctrl,
        ignored = MODEL.ignored_entities[c.identifier],
        dy,
        stroke_color,
        stroke_width,
        slack_color = '',
        active = false,
        oval,
        chev,
        ady;
    if(!ignored && MODEL.solved) {
      // Check whether slack is used in this time step
      if(!c.no_slack && c.slack_info.hasOwnProperty(MODEL.t)) {
        // If so, draw constraint in red if UB slack is used, or in
        // blue if LB slack is used
        slack_color = (c.slack_info[MODEL.t] === 'UB' ? '#c00000' : '#0000d0');
      } else {
        // Check if constraint is "active" ("on" a bound line)
        active = c.active(MODEL.t);
      }
    }
    // Clear previous drawing
    c.shape.clear();
    const vn = c.visibleNodes;

    // Double-check: do not draw unless either node is visible
    if(!vn[0] && !vn[1]) return;
    
    // NOTE: `ady` ("arrow dy") compensates for the length of the
    // (always vertical) arrow heads
    if(c.selected) {
      // Draw arrow line thick and in red
      stroke_color = this.palette.select;
      stroke_width = 1.5;
      oval = this.selected_small_oval;
      chev = this.selected_chevron;
      ady = 4;
    } else if(!ignored && active) {
      // Draw arrow line a bit thicker and in purple
      stroke_color = this.palette.at_process_ub;
      stroke_width = 1.4;
      oval = this.active_small_oval;
      chev = this.active_chevron;
      ady = 3.5;
    } else if(!ignored && c.no_slack) {
      // Draw arrow in black
      stroke_color = 'black';
      stroke_width = 1.3;
      oval = this.black_small_oval;
      chev = this.black_chevron;
      ady = 3;
    } else {
      stroke_color = ignored ? this.palette.ignore :
          (slack_color ? slack_color : this.palette.node_rim);
      stroke_width = 1.25;
      oval = this.small_oval;
      chev = this.chevron;
      ady = 3;
    }

    if(vn[0] && vn[1]) {
      // Both nodes are visible => calculate start, end and control
      // points for the curved arrow
      // NOTE: nodes are assumed to have been positioned, so the X and Y
      // of products have been updated to correspond with those of their
      // placeholders in the focal cluster
      const
          p = c.from_node,
          q = c.to_node;
      // First calculate the constraint offsets 
      p.setConstraintOffsets();
      q.setConstraintOffsets();
      const    
          from = [p.x + c.from_offset, p.y],
          to = [q.x + c.to_offset, q.y],
          hph = p.height/2 + ady,
          hqh = q.height/2 + ady,
          // Control point modifier: less vertical "pull" on points
          // that have their X further from the node center
          from_cpm = (1 - Math.abs(c.from_offset) / p.width) * 1.3,
          to_cpm = (1 - Math.abs(c.to_offset) / p.width) * 1.3;
      // Now establish the correct y-coordinates
      dy = to[1] - from[1];
      if(p.y < q.y - hqh - p.height) {
        // If q lies amply below p, then bottom p --> top q
        from[1] += hph;
        to[1] -= hqh;
        // Control point below start point and above end point
        from_ctrl = [from[0], from[1] + from_cpm * dy / 3];
        to_ctrl = [to[0], to[1] - to_cpm * dy / 3];
      } else if(q.y < p.y - hph - q.height) {
        // If p lies amply below q, then top p --> bottom q
        from[1] -= hph;
        to[1] += hqh;
        // Control point above start point and below end point
        from_ctrl = [from[0], from[1] + from_cpm * dy / 3];
        to_ctrl = [to[0], to[1] - to_cpm * dy / 3];
      } else {
        // If top --> top (never bottom --> bottom)
        from[1] -= hph;
        to[1] -= hqh;
        // Control point above start point and end point
        from_ctrl = [from[0], from[1] - from_cpm * hph];
        to_ctrl = [to[0], to[1] - to_cpm * hqh];
      }
      c.midpoint = this.bezierPoint(from, from_ctrl, to_ctrl, to, 0.5);
      // NOTE: SoC is displayed near the node that *incurs* the cost
      c.socpoint = this.bezierPoint(from, from_ctrl, to_ctrl, to,
          (c.soc_direction === VM.SOC_X_Y ? 0.75 : 0.25));
      // Arrow head markers depend on constraint
      const path = ['M', from[0], ',', from[1], 'C', from_ctrl[0], ',',
          from_ctrl[1], ',', to_ctrl[0], ',', to_ctrl[1], ',',
          to[0], ',', to[1]];
      // Draw Bezier path of curved arrow first thickly and nearly transparent
      // to be easier to "hit" by the cursor
      c.shape.addPath(path,
          {fill: 'none', stroke: 'rgba(255,255,255,0.1)', 'stroke-width': 5});
      // Over this thick band, draw the dashed-line arrow
      c.shape.addPath(path,
          {fill: 'none', stroke: stroke_color, 'stroke-width': stroke_width,
          'stroke-dasharray': UI.sda.short_dash, 'stroke-linecap': 'round',
          // NOTE: to indicate "no constraint", omit the oval, but keep
          // the arrow point or the direction X->Y would become ambiguous
          'marker-start': oval, 'marker-end': chev});
    } else if(vn[0]) {
      // If only the FROM node is visible, set the thumbnail midpoint at
      // the top center of this node, taking into account other constraints
      // that relate to this node
      c.from_node.setConstraintOffsets();
      c.midpoint = [c.from_node.x + c.from_offset,
          c.from_node.y - c.from_node.height/2 - 7]; 
    } else if(vn[1]) {
      // Do likewise if only the TO node is visible
      c.to_node.setConstraintOffsets();
      c.midpoint = [c.to_node.x + c.to_offset,
          c.to_node.y - c.to_node.height/2 - 7]; 
    }
    // Draw the 12x12 px size thumbnail chart showing the infeasible areas
    // NOTE: if no arrow, the hasArrow method will have set c.midpoint
    // Add the SVG sub-element that will contain the paths
    // NOTE: define same scale for viewbox as used by the ConstraintEditor
    const
        scale = CONSTRAINT_EDITOR.scale,
        s = 100 * scale,
        ox = CONSTRAINT_EDITOR.oX,
        oy = CONSTRAINT_EDITOR.oY,
        svg = c.shape.addSVG(c.midpoint[0] - 6, c.midpoint[1] - 6,
            {width: 12, height: 12, viewBox: `${ox},${oy - s},${s},${s}`});
    // Draw a white square with gray border as base for the two contours
    let el = this.newSVGElement('rect');
    // Adjust rim thickness and color if slack is used in this time step
    // NOTE: use extra thick border, as this image will be scaled down
    // by a factor 25
    if(slack_color) {
      stroke_width = 100;
      stroke_color = slack_color;
    } else {
      stroke_width = 25;
    }
    this.addSVGAttributes(el,
        {x: ox, y: (oy - s), width: s, height: s,
            // NOTE: EQ boundline => whole area is infeasible => silver
            fill: (c.setsEquality ? UI.color.src_snk : 'white'),
            stroke: stroke_color, 'stroke-width': stroke_width});
    svg.appendChild(el);
    // Add the bound line contours
    for(let i = 0; i < c.bound_lines.length; i++) {
      const
          bl = c.bound_lines[i],
          // Draw thumbnail in shades of the arrow color, but use black
          // for regular color or the filled areas turn out too light
          clr = (stroke_color === this.palette.node_rim ? 'black' : stroke_color);
      el = this.newSVGElement('path');
      if(bl.type === VM.EQ) {
        // For EQ bound lines, draw crisp line on silver background
        this.addSVGAttributes(el,
            {d: bl.contour_path, fill: 'none', stroke: clr, 'stroke-width': 30});
      } else {
        // Draw infeasible area in gray
        this.addSVGAttributes(el, {d: bl.contour_path, fill: clr, opacity: 0.3});
      }
      svg.appendChild(el);
    }
    // Draw the share of cost (only if relevant and non-zero) near tail
    // (or head if Y->X) of arrow in a pale yellow filled box
    if(MODEL.infer_cost_prices && c.share_of_cost) {
      let s = VM.sig4Dig(c.share_of_cost * 100) + '%',
          bb = this.numberSize(s, 7),
          tw = bb.width + 3,
          th = bb.height + 1,
          // NOTE: when only one node is visible, display the SoC in
          // gray for the node that is *contributing* the cost, and
          // then do not display the total amount
          soc = ((vn[0] && c.soc_direction === VM.SOC_Y_X) ||
              (vn[1] && c.soc_direction === VM.SOC_X_Y)),
          clr = (soc ? 'black' : 'gray');
      if(!(vn[0] && vn[1])) {
        // No arrow => draw SoC above the thumbnail
        c.socpoint = [c.midpoint[0], c.midpoint[1] - 11];
      }
      c.shape.addRect(c.socpoint[0], c.socpoint[1], tw, th,
          {stroke: clr, 'stroke-width': 0.3, fill: this.palette.cost_price,
              rx: 2, ry: 2});
      c.shape.addNumber(c.socpoint[0], c.socpoint[1], s, {fill: clr});
      if(MODEL.solved && soc) {
        // Assume no cost price to be displayed
        s = '';
        // For X->Y transfer, display SoC * (unit cost price * level) of
        // FROM node, of TO node
        const
            ucp = (c.soc_direction === VM.SOC_X_Y ?
                c.from_node.costPrice(MODEL.t) :
                c.to_node.costPrice(MODEL.t)),
            fl = c.from_node.actualLevel(MODEL.t),
            tl = c.to_node.actualLevel(MODEL.t);
        // If either node level indicates an exception
        if(fl <= VM.MINUS_INFINITY || tl <= VM.MINUS_INFINITY) {
          s = '\u26A0'; // Warning sign
        } else if(ucp <= VM.MINUS_INFINITY || ucp >= VM.PLUS_INFINITY) {
          // NOTE: the first condition ensures that error codes will be displayed
          s = VM.sig4Dig(ucp);
        } else if(Math.abs(ucp) <= VM.SIG_DIF_FROM_ZERO ||
            Math.abs(fl) <= VM.SIG_DIF_FROM_ZERO ||
            Math.abs(tl) <= VM.SIG_DIF_FROM_ZERO) {
          s = '0';
        } else {
          // NOTE: display the total cost price (so not "per unit")
          s = VM.sig4Dig((c.soc_direction === VM.SOC_X_Y ? fl : tl) *
              ucp * c.share_of_cost);
        }
        // Only display cost price if it is meaningful
        if(s) {
          bb = this.numberSize(s, 8);
          tw = bb.width;
          th = bb.height;
          const
              cpx = c.midpoint[0],
              cpy = c.midpoint[1] + 12;
          c.shape.addRect(cpx, cpy, tw, th, {'fill': this.palette.cost_price});
          c.shape.addNumber(cpx, cpy, s, {'fill': 'gray'});
        }
      }
    }    
    // Highlight shape if it has comments
    c.shape.element.setAttribute('style',
        (DOCUMENTATION_MANAGER.visible && c.comments ?
            this.documented_filter : ''));
    c.shape.appendToDOM();
  }

  drawProcess(proc, dx=0, dy=0) {
    // Clear previous drawing
    proc.shape.clear();
    // Do not draw process unless in focal cluster
    if(MODEL.focal_cluster.processes.indexOf(proc) < 0) return;
    // Set local constants and variables 
    const
        ignored = MODEL.ignored_entities[proc.identifier],
        x = proc.x + dx,
        y = proc.y + dy,
        // NOTE: display bounds in italics if either is not static
        bfs = (proc.lower_bound.isStatic && proc.upper_bound.isStatic ?
            'normal' : 'italic'),
        il = proc.initial_level.result(1);
    let l = (MODEL.solved ? proc.actualLevel(MODEL.t) : VM.NOT_COMPUTED),
        lb = proc.lower_bound.result(MODEL.t),
        ub = (proc.equal_bounds ? lb : proc.upper_bound.result(MODEL.t));
    // NOTE: by default, lower bound = 0 (but do show exceptional values)
    if(lb === VM.UNDEFINED && !proc.lower_bound.defined) lb = 0;
    let hw,
        hh,
        s,
        font_color = 'white',
        lrect_color = 'none',
        stroke_width = 1,
        stroke_color = (ignored ? this.palette.ignore : this.palette.node_rim),
        is_fc_option = proc.needsFirstCommitData,
        fc_option_node = proc.linksToFirstCommitDataProduct,
        // First-commit options have a shorter-dashed rim
        sda = (is_fc_option || fc_option_node ?
            UI.sda.shorter_dash : 'none'),
        bar_ratio = 0,
        fill_color = this.palette.node_fill,
        bar_color = this.palette.process_level_bar;
    // Colors co-depend on production level (if computed)
    if(MODEL.solved && !ignored) {
      if(l === VM.PLUS_INFINITY) {
        // Infinite level => unbounded solution
        stroke_color = this.palette.infinite_level;
        fill_color = this.palette.infinite_level_fill;
        lrect_color = this.palette.infinite_level;
        font_color = 'white';
        stroke_width = 2;
      } else if(l > ub - VM.SIG_DIF_FROM_ZERO ||
          (lb < -VM.SIG_DIF_FROM_ZERO && l < lb + VM.SIG_DIF_FROM_ZERO)) {
        // At full capacity => active constraint
        if(Math.abs(l) < VM.SIG_DIF_FROM_ZERO) {
          // Differentiate: if bound = 0, use neutral colors to reflect that
          // the process is not actually "running"
          stroke_color = this.palette.node_rim;
          fill_color = 'white';
          lrect_color = 'black';
          bar_color = this.palette.src_snk;
        } else {
          stroke_color = (l < 0 ? this.palette.at_process_neg_lb :
              this.palette.at_process_ub);
          fill_color = this.palette.at_process_ub_fill;
          lrect_color = stroke_color;
          bar_color = this.palette.at_process_ub_bar;
        }
        bar_ratio = 1;
        font_color = 'white';
        stroke_width = 2;
      } else if(Math.abs(l) < VM.SIG_DIF_FROM_ZERO) {
        font_color = this.palette.node_rim;
      } else if(l < 0) {
        // Negative level => more reddish stroke and font
        font_color = this.palette.compound_flow;
        stroke_color = font_color;
        if(lb < -VM.NEAR_ZERO) bar_ratio = l / lb;
        stroke_width = 1.25;
      } else {
        font_color = this.palette.active_process;
        stroke_color = font_color;
        if(ub > VM.NEAR_ZERO) bar_ratio = l / ub;
        stroke_width = 1.25;
      }
      // For options, set longer-dashed rim if committed at time <= t
      const fcn = (is_fc_option ? proc : fc_option_node);
      if(fcn && fcn.start_ups.length > 0 && MODEL.t >= fcn.start_ups[0]) {
        sda = UI.sda.longer_dash;
      }
    } else if(il) {
      // Display non-zero initial level black-on-white, and then also
      // display the level bar
      if(il < 0 && lb < -VM.NEAR_ZERO) {
        bar_ratio = il / lb;
      } else if(il > 0 && ub > VM.NEAR_ZERO) {
        bar_ratio = il / ub;
      }
      bar_color = this.palette.src_snk;
    }
    // Being selected overrules special border properties except SDA
    if(proc.selected) {
      stroke_color = this.palette.select;
      stroke_width = 2;
    }
    if(proc.collapsed) {
      hw = 8.5;
      hh = 6;
    } else {
      hw = proc.width / 2;
      hh = proc.height / 2;
    }
    // Draw frame using colors as defined above
    proc.shape.addRect(x, y, 2 * hw, 2 * hh,
        {fill: fill_color, stroke: stroke_color, 'stroke-width': stroke_width,
            'stroke-dasharray': sda, 'stroke-linecap': 'round'});
    // Draw level indicator: 8-pixel wide vertical bar on the right
    if(bar_ratio > VM.NEAR_ZERO) {
      // Calculate half the bar's height (bar rectangle is centered)
      const
          hsw = stroke_width / 2,
          hbl = hh * bar_ratio - hsw;
      // NOTE: when level < 0, bar drops down from top
      proc.shape.addRect(x + hw - 4 - hsw,
          (l < 0 ? y - hh + hbl + hsw : y + hh - hbl - hsw),
          8, 2 * hbl, {fill: bar_color, stroke: 'none'});
    }
    // If semi-continuous, add a double rim 2 px above the bottom line
    if(proc.level_to_zero) {
      const bly = y + hh - 2;
      proc.shape.addPath(['M', x - hw, ',', bly, 'L', x + hw, ',', bly],
          {'fill': 'none', stroke: stroke_color, 'stroke-width': 0.6});
    }
    if(!proc.collapsed) {
      // If model has been computed or initial level is non-zero, draw
      // production level in upper right corner
      const il = proc.initial_level.result(1);
      if(MODEL.solved || il) {
        if(!MODEL.solved) {
          l = il;
          font_color = 'black';
        }
        s = VM.sig4Dig(Math.abs(l));
        // Oversize level box width by 4px and height by 1px
        const
            bb = this.numberSize(s, 9),
            bw = bb.width + 2,
            bh = bb.height;
        // Upper right corner =>
        //   (x + width/2 - number width/2, y - height/2 + number height/2)
        // NOTE: add 0.5 margin to stay clear from the edges
        const
            cx = x + hw - bw / 2 - 0.5,
            cy = y - hh + bh / 2 + 0.5; 
        proc.shape.addRect(cx, cy, bw, bh, {fill: lrect_color});
        if(Math.abs(l) >= -VM.ERROR) {
          proc.shape.addNumber(cx, cy, s,
              {'font-size': 9, 'fill': this.palette.VM_error});
        } else {
          proc.shape.addNumber(cx, cy, s,
              {'font-size': 9, 'fill': font_color, 'font-weight': 700});
        }
      }
      // Draw boundaries in upper left corner
      // NOTE: their expressions should have been computed
      s = VM.sig4Dig(lb);
      // Calculate width of lower bound because it may have to be underlined
      let lbw = this.numberSize(s).width;
      // Default offset for lower bound undercore (if drawn)
      let lbo = 1.5;
      if(ub === lb) {
        // If bounds are equal, show bound preceded by equal sign
        s = '=' + s;
        // Add text width of equal sign to offset
        lbo += 5;
      } else {
        const ubs = (ub >= VM.PLUS_INFINITY && !proc.upper_bound.defined ?
            '\u221E' : VM.sig4Dig(ub));
        if(Math.abs(lb) > VM.NEAR_ZERO) {
          // If lb <> 0 then lb...ub (with ellipsis)
          s += '\u2026' + ubs;
        } else {
          // If lb = 0 show only the upper bound
          s = ubs;
          lbw = 0;
        }
      }
      // Keep track of the width of the boundary text, as later it may be
      // followed by more text
      const
          bb = this.numberSize(s),
          btw = bb.width + 2,
          sh = bb.height,
          tx = x - hw + 1,
          ty = y - hh + sh/2 + 1;
      proc.shape.addNumber(tx + btw/2, ty, s,
          {fill: 'black', 'font-style': bfs});
      // Show start/stop-related status right of the process boundaries
      // NOTE: lb must be > 0 for start/stop to work
      if(proc.level_to_zero && lbw) {
        font_color = 'black';
        // Underline the lower bound to indicate semi-continuity
        proc.shape.addPath(
            ['M', tx + lbo, ',', ty + sh/2, 'L', tx + lbo + lbw, ',', ty + sh/2],
            {'fill': 'none', stroke: font_color, 'stroke-width': 0.4});
        // By default, no ON/OFF indicator
        s = '';
        if(MODEL.solved && l !== VM.UNDEFINED) {
          // Solver has been active
          const
              pl = proc.actualLevel(MODEL.t - 1),
              su = proc.start_ups.indexOf(MODEL.t),
              sd = proc.shut_downs.indexOf(MODEL.t);
          if(Math.abs(l) > VM.NEAR_ZERO) {
            // Process is ON
            if(Math.abs(pl) < VM.NEAR_ZERO && su >= 0) {
              font_color = this.palette.switch_on_off;
              // Start-up arrow or first-commit asterisk
              s = VM.LM_SYMBOLS[su ? VM.LM_STARTUP : VM.LM_FIRST_COMMIT];
            } else if(su >= 0) {
              font_color = 'black';
              s = '\u25B3'; // Outline triangle up to indicate anomaly
            }
            if(sd >= 0) {
              // Should not occur, as for shut-down, level should be 0
              font_color = 'black';
              s += '\u25BD'; // Add outline triangle down to indicate anomaly
            }
          } else {
            // Process is OFF => check previous level
           if(Math.abs(pl) > VM.NEAR_ZERO && sd >= 0) {
              // Process was on, and is now switched OFF
              font_color = this.palette.switch_on_off;
              s = VM.LM_SYMBOLS[VM.LM_SHUTDOWN];
            } else if(sd >= 0) {
              font_color = 'black';
              s = '\u25BD'; // Outline triangle down to indicate anomaly
            }
            if(su >= 0) {
              // Should not occur, as for start-up, level should be > 0
              font_color = 'black';
              s += '\u25B3'; // Add outline triangle up to indicate anomaly
            }
          }
        }
        if(s) {
          // Special symbols are 5 pixels wide and 9 high
          proc.shape.addText(x - hw + btw + 5, y - hh + 4.5, s,
              {fill: font_color});
        }
      }
      if(MODEL.infer_cost_prices && MODEL.solved) {
        // Draw costprice data in lower left corner
        const cp = proc.costPrice(MODEL.t);
        s = VM.sig4Dig(cp);
        if(l === 0) {
          // No "real" cost price when process level = 0
          font_color = 'silver';
          fill_color = this.palette.virtual_cost_price;
        } else {
          font_color = 'black';
          fill_color = this.palette.cost_price;
        }
        const
            cpbb = this.numberSize(s),
            cpbw = cpbb.width + 2,
            cpbh = cpbb.height + 1;
        proc.shape.addRect(x - hw + cpbw/2 + 0.5, y + hh - cpbh/2 - 0.5,
            cpbw, cpbh, {fill: fill_color});
        proc.shape.addNumber(x - hw + cpbw/2 + 0.5, y + hh - cpbh/2 - 0.5, s,
            {fill: font_color});
      }
      // Draw pace in lower right corner if it is not equal to 1
      if(proc.pace !== 1) {
        const
            pbb = this.numberSize(proc.pace, 7),
            pbw = pbb.width,
            hpbh = pbb.height/2;
        proc.shape.addText(x + hw - pbw - 5.75, y + hh - hpbh - 3.5,
            '1', {'font-size': 7,fill: '#202060'});
        proc.shape.addText(x + hw - pbw - 3, y + hh - hpbh - 2.5, '/',
            {'font-size': 10, fill: '#202060'});
        proc.shape.addText(x + hw - pbw/2 - 2, y + hh - hpbh - 1.25,
            proc.pace, {'font-size': 7, fill: '#603060'});
      }
      // Always draw process name plus actor name (if any)
      const
          th = proc.name_lines.split('\n').length * this.font_heights[10] / 2,
          cy = (proc.hasActor ? y - 8 : y - 2);
      proc.shape.addText(x, cy, proc.name_lines, {'font-size': 10});
      if(proc.hasActor) {
        const format = Object.assign({},
            this.io_formats[MODEL.ioType(proc.actor)],
            {'font-size': 10, fill: this.palette.actor_font,
                'font-style': 'italic'});
        proc.shape.addText(x, cy + th + 6, proc.actor.name, format);
      }
      // Integer level is denoted by enclosing name in large [ and ]
      // to denote "floor" as well as "ceiling"
      if(proc.integer_level) {
        const
            htw = 0.5 * proc.bbox.width + 5, 
            brh = proc.bbox.height + 4,
            brw = 3.5;
        proc.shape.addPath(['m', x - htw, ',', cy - 0.5*brh,
            'l-', brw, ',0l0,', brh, 'l', brw, ',0'],
            {fill: 'none', stroke: 'gray', 'stroke-width': 1});  
        proc.shape.addPath(['m', x + htw, ',', cy - 0.5*brh,
            'l', brw, ',0l0,', brh, 'l-', brw, ',0'],
            {fill: 'none', stroke: 'gray', 'stroke-width': 1});
      }
    } // end IF not collapsed
    if(MODEL.show_block_arrows && !ignored) {
      // Add block arrows for hidden input and output links (no IO for processes)
      proc.shape.addBlockArrow(x - hw + 3, y - hh + 17, UI.BLOCK_IN,
          proc.hidden_inputs.length);
      proc.shape.addBlockArrow(x + hw - 4, y - hh + 17, UI.BLOCK_OUT,
          proc.hidden_outputs.length);
    }
    // Highlight shape if it has comments
    proc.shape.element.firstChild.setAttribute('style',
        (DOCUMENTATION_MANAGER.visible && proc.comments.length > 0 ?
            this.documented_filter : ''));
    proc.shape.element.setAttribute('opacity', 0.9);
    proc.shape.appendToDOM();    
  }
  
  drawProduct(prod, dx=0, dy=0) {
    // Clear previous drawing
    prod.shape.clear();
    // Do not draw product unless it has a position in the focal cluster
    let pp = prod.positionInFocalCluster;

    if(!pp) return;
    // Set X and Y to correct value for this diagram
    prod.x = pp.x;
    prod.y = pp.y;
    let s,
        bb,
        pf = false,
        at_bound = false,
        ignored = MODEL.ignored_entities[prod.identifier],
        font_color = 'black',
        fill_color = 'white',
        rim_color,
        stroke_color,
        stroke_width,
        // Draw border as dashed line if product is data product 
        sda = (prod.is_data ? UI.sda.dash : 'none'),
        first_commit_option = prod.needsFirstCommitData,
        x = prod.x + dx,
        y = prod.y + dy,
        hw = prod.width / 2,
        hh = prod.height / 2,
        cx,
        cy,
        lb = VM.MINUS_INFINITY,
        ub = VM.PLUS_INFINITY;
    if(prod.hasBounds) {
      if(prod.lower_bound.defined) {
        lb = prod.lower_bound.result(MODEL.t);
      }
      if(prod.equal_bounds) {
        ub = lb;
      } else if(prod.upper_bound.defined) {
        ub = prod.upper_bound.result(MODEL.t);
      }
    }
    // When model not solved, use initial level
    let l = prod.actualLevel(MODEL.t);
    if(!MODEL.solved  && prod.initial_level.defined) {
      l = prod.initial_level.result(1);
    }
    if(first_commit_option) {
      // Set short-dashed rim if not committed yet at time t
      if(!MODEL.solved || prod.start_ups.length === 0 ||
          MODEL.t < prod.start_ups[0]) {
        sda = UI.sda.shorter_dash;
      } else {
        // Otherwise, set longer-dashed rim to denote "has been committed"
        sda = UI.sda.longer_dash;
      }
    }
    if(prod.selected) {
      stroke_color = this.palette.select;
      stroke_width = 2;
    } else  {
      stroke_color = ignored ? this.palette.ignore :
          (prod.no_slack ? 'black' : this.palette.node_rim);
      // Thick rim if deleting this product only occurs in the focal cluster
      stroke_width = (prod.allLinksInCluster(MODEL.focal_cluster) ? 1.5 : 0.6);
    }
    if(prod.hasBounds) {
      font_color = 'black';
      // By default, "plain" factors having bounds are filled in silver
      fill_color = this.palette.has_bounds;
      // Use relative distance to bounds so that 100000.1 is not shown
      // as overflow, but 100.1 is
      let udif = this.relDif(l, ub),
          ldif = this.relDif(lb, l);
      // Special case: for LB = 0, use the ON/OFF threshold
      if(Math.abs(lb) <= VM.SIG_DIF_LIMIT &&
          Math.abs(l) <= VM.ON_OFF_THRESHOLD) ldif = 0;
      if(MODEL.solved) {
        // NOTE: use bright red and blue colors in case of "stock level out of bounds"
        if(ub < VM.PLUS_INFINITY && l < VM.UNDEFINED && udif > VM.SIG_DIF_LIMIT) {
          fill_color = this.palette.above_upper_bound;
          font_color = 'blue';
        } else if(lb > VM.MINUS_INFINITY && ldif > VM.SIG_DIF_LIMIT) {
          fill_color = this.palette.below_lower_bound;
          font_color = 'red';
        } else if(l < VM.ERROR || l > VM.EXCEPTION) {
          font_color = this.palette.VM_error;
        } else if(l < VM.UNDEFINED) {
          // Shades of green reflect whether level within bounds, where
          // "sources" (negative level) and "sinks" (positive level) are
          // shown as more reddish / bluish shades of green
          if(l < -VM.ON_OFF_THRESHOLD) {
            fill_color = this.palette.neg_within_bounds;
          } else if(l > VM.ON_OFF_THRESHOLD) {
            fill_color = this.palette.pos_within_bounds;
          } else {
              fill_color = this.palette.zero_within_bounds;
          }
          if(ub - lb < VM.NEAR_ZERO) {
            if(prod.isConstant && Math.abs(l) > VM.NEAR_ZERO) {
              // Non-zero constants have less saturated shades
              fill_color = (l < 0 ? this.palette.neg_constant :
                  this.palette.pos_constant);  
            }
          } else if(ub - l < VM.SIG_DIF_LIMIT) {
            // Black font and darker fill color indicate "at upper bound"
            font_color = 'black';
            fill_color = (ub > 0 ? this.palette.at_pos_ub_fill :
                (ub < 0 ? this.palette.at_neg_ub_fill :
                    this.palette.at_zero_ub_fill));
            at_bound = true;
          } else if (l - lb < VM.SIG_DIF_LIMIT) {
            // Font and rim color indicate "at upper bound"
            font_color = 'black';
            fill_color = (lb > 0 ? this.palette.at_pos_lb_fill :
                (lb < 0 ? this.palette.at_neg_lb_fill :
                    this.palette.at_zero_lb_fill));
            at_bound = true;
          } else {
            // set "partial fill" flag if not at lower bound and UB < INF
            pf = ub < VM.PLUS_INFINITY;
            font_color = this.palette.within_bounds_font;
          }
        }
      } else if(ub - lb < VM.NEAR_ZERO) {
        // Not solved but equal bounds => probably constants
        if(prod.isConstant && Math.abs(ub) > VM.NEAR_ZERO) {
          // Non-zero constants have less saturated shades
          fill_color = (ub < 0 ? this.palette.neg_constant :
              this.palette.pos_constant);  
        }
      } else if(l < VM.UNDEFINED) {
        // Different bounds and initial level set => partial fill
        fill_color = this.palette.src_snk;
        pf = true;
        if(ub - l < VM.SIG_DIF_LIMIT || l - lb < VM.SIG_DIF_LIMIT) {
          at_bound = true;
        }
      }
    } else if(l < VM.UNDEFINED) {
      if(l > VM.SIG_DIF_FROM_ZERO) {
        if(l >= VM.PLUS_INFINITY) {
          fill_color = this.palette.above_upper_bound;
          font_color = 'blue';
        } else if(prod.isSinkNode) {
          fill_color = this.palette.positive_stock;
          font_color = this.palette.produced;
        } else {
          fill_color = this.palette.above_upper_bound;
          font_color = 'blue';
        }
      } else if(l < -VM.SIG_DIF_FROM_ZERO) {
        if(l <= VM.MINUS_INFINITY) {
          fill_color = this.palette.below_lower_bound;
          font_color = 'red';
        } else if(prod.isSourceNode) {
          fill_color = this.palette.negative_stock;
          font_color = this.palette.consumed;
        } else {
          fill_color = this.palette.below_lower_bound;
          font_color = 'red';
        }
      } else if(prod.is_buffer) {
        fill_color = 'silver';
        font_color = 'black';
      }
    }
    if(prod.is_buffer) {
      // Products with storage capacity show their partial fill
      pf = true;
      // Background fill color of buffers is white unless exceptional
      let npfbg = 'white';
      if(fill_color === this.palette.above_upper_bound ||
          fill_color === this.palette.below_lower_bound ||
          // NOTE: empty buffers (at level 0) should be entirely white
          (at_bound && l > VM.ON_OFF_THRESHOLD)) {
        npfbg = fill_color;
        pf = false;
      }
      // Products are displayed as "roundboxes" with sides that are full hemicircles
      prod.shape.addRect(x, y, 2*hw, 2*hh,
          {fill: npfbg, stroke: stroke_color, 'stroke-width': 3, rx: hh, ry: hh});
      // Draw thin white line insize thick border to suggest a double rim
      prod.shape.addRect(x, y, 2*hw, 2*hh, {fill: 'none', stroke: 'white',
          'stroke-dasharray': sda, 'stroke-linecap': 'round', rx: hh, ry: hh});
    } else {
      prod.shape.addRect(x, y, 2*hw, 2*hh,
          {fill: fill_color, stroke: stroke_color, 'stroke-width': stroke_width,
              'stroke-dasharray': sda, 'stroke-linecap': 'round',
              'rx': hh, 'ry': hh});
      // NOTE: set fill color to darker shade for partial fill
      fill_color = (!MODEL.solved ? this.palette.src_snk :
          (l > VM.NEAR_ZERO ? this.palette.above_zero_fill :
              (l < -VM.NEAR_ZERO ? this.palette.below_zero_fill :
                  this.palette.at_zero_fill)));
    }
    // Add partial fill if appropriate
    if(pf && l > lb && l < VM.UNDEFINED) {
      // Calculate used part of range (1 = 100%)
      let part,
          range = ub - lb;
      if(l >= VM.PLUS_INFINITY) {
        // Show exceptions and +INF as "overflow"
        part = 1;
        fill_color = this.palette.above_upper_bound;
      } else {
        part = (range > 0 ? (l - lb) / range : 1);
      }
      if(part > 0 && l >= lb) {
        // Only fill the portion of used range with the fill color
        const rad = Math.asin(1 - 2*part);
        prod.shape.addPath(['m', x + hw - hh + (hh - 1.5) * Math.cos(rad),
            ',', y + (hh - 1.5) * Math.sin(rad),
            this.arc(hh - 1.5, rad, Math.PI/2),
            'l', 2*(hh - hw), ',0',
            this.arc(hh - 1.5, Math.PI/2, Math.PI-rad), 'z'],
            {fill: fill_color});
      }
    }
    fill_color = this.palette.src_snk;
    stroke_color = 'none';
    stroke_width = 0;
    // Sources have a triangle pointing up from the bottom
    // (in outline if *implicit* source)
    if(prod.isSourceNode) {
      if(!prod.is_source) {
        fill_color = 'none';
        stroke_color = this.palette.src_snk;
        stroke_width = 0.75;
      }
      prod.shape.addPath(['m', x, ',', y, 'l', 0.44*hw, ',', hh-1.5,
          'l-', 0.88*hw, ',0z'], {fill: fill_color, stroke: stroke_color,
          'stroke-width': stroke_width});
    }
    // Sinks have a triangle pointing down from the top
    // (in outline if implicit sink)
    if(prod.isSinkNode) {
      if(!prod.is_sink) {
        fill_color = 'none';
        stroke_color = this.palette.src_snk;
        stroke_width = 0.75;
      }
      prod.shape.addPath(['m', x, ',', y, 'l', 0.44*hw, ',-', hh-1.5,
          'l-', 0.88*hw, ',0z'], {fill: fill_color, stroke: stroke_color,
          'stroke-width': stroke_width});  
    }
    // Integer level is denoted by enclosing name in large [ and ]
    // to denote "floor" as well as "ceiling"
    if(prod.integer_level) {
      const
          brh = prod.name_lines.split('\n').length * this.font_heights[8] + 4,
          brw = 3.5;
      prod.shape.addPath(['m', x - 0.5*(hw + brw), ',', y - 0.5*brh - 2,
          'l-', brw, ',0l0,', brh, 'l', brw, ',0'],
          {fill: 'none', stroke: 'gray', 'stroke-width': 1});  
      prod.shape.addPath(['m', x + 0.5*(hw + brw), ',', y - 0.5*brh - 2,
          'l', brw, ',0l0,', brh, 'l-', brw, ',0'],
          {fill: 'none', stroke: 'gray', 'stroke-width': 1});
    }

    let hlh = 0,
        lw = 0,
        lx = x + hw - 3;
    if(!ignored && (MODEL.solved || (l > 0 && l < VM.EXCEPTION))) {
      // Write the stock level in the right semicircle
      s = VM.sig4Dig(l);
      bb = this.numberSize(s, 9, 700);
      lw = bb.width;
      hlh = bb.height/2 + 1;
      const attr = {'font-size': 9, 'text-anchor': 'end'};
      // NOTE: use anchor to align the stock level text to the right side
      if(l <= VM.ERROR) {
        attr.fill = this.palette.VM_error;
      } else {
        attr.fill = font_color;
        attr['font-weight'] = 700;
        if(at_bound) attr['text-decoration'] = 'solid black underline';
      }
      prod.shape.addNumber(lx, y - hlh, s, attr);
    }
    if(MODEL.solved && !ignored) {
      if(MODEL.infer_cost_prices) {
        // Write the cost price at bottom-right in a light-yellow, slightly
        // rounded box. NOTE: for products with storage, display the STOCK price
        // rather than the cost price
        const cp = (prod.is_buffer ? prod.stockPrice(MODEL.t) :
            prod.costPrice(MODEL.t));
        s = VM.sig4Dig(cp);
        if(prod.noInflows(MODEL.t) && !(prod.is_buffer && (l > 0))) {
          // Display cost price less prominently if the product is not produced
          font_color = 'silver';
          fill_color = this.palette.virtual_cost_price;
        } else {
          font_color = 'black';
          fill_color = this.palette.cost_price;
        }
        bb = this.numberSize(s);
        prod.shape.addRect(x - hw + hh + 7, y + hh - bb.height/2 - 1,
            bb.width+1, bb.height, {fill: fill_color, stroke: this.palette.node_rim,
            'stroke-width': 0.25, rx: 1.5, ry: 1.5});
        prod.shape.addNumber(x - hw + hh + 7, y + hh - bb.height/2 - 1, s,
            {fill: font_color});
      }
    }
    
    // Write the product scale unit in the right semicircle UNDER the stock level
    const us = prod.scale_unit;
    // do not show 1 as it denotes "no unit"
    if(us != '1') {
      const uw = this.textSize(us).width;
      // Add a right margin to the unit if it is narrower than the stock level
      const ux = lx - Math.max((lw - uw)/2, 0);
      prod.shape.addText(ux, y + hlh, us,
          {fill: this.palette.unit, 'text-anchor': 'end'});
    }

    // If market price is non-zero, write it at bottom-right in a gold box... 
    const
        mp = prod.price.result(MODEL.t),
        // Italics denote "price is dynamic"
        pfs = (prod.price.isStatic ? 'normal' : 'italic');
    if((Math.abs(mp) - VM.NEAR_ZERO > 0) && (mp < VM.UNDEFINED)) {
      s = VM.sig4Dig(mp);
      if(mp > 0) {
        font_color = 'black';
        fill_color = this.palette.price;
        rim_color = this.palette.price_rim;
      } else {
        // ... or in a black box if the price is negative
        font_color = 'white';
        fill_color = 'black';
        rim_color = this.palette.node_rim;
      }
      bb = this.numberSize(s);
      prod.shape.addRect(x + hw - hh - 7, y + hh - bb.height/2 - 1,
          bb.width+1, bb.height, {fill: fill_color, stroke: rim_color,
          'stroke-width': 0.25, rx: 1.5, ry: 1.5});
      prod.shape.addNumber(x + hw - hh - 7, y + hh - bb.height/2 - 1,
          s, {fill: font_color, 'font-style': pfs});
    }

    // Bounds are displayed on the left
    // NOTE: their expressions should have been computed
    if(prod.hasBounds) {
      // Display bounds in bold face if no slack, and italic if not static
      const
          fw = (prod.no_slack ? 700 : 400),
          lbfs = (prod.lower_bound.isStatic ? 'normal' : 'italic'),
          ubfs = (prod.upper_bound.isStatic ? 'normal' : 'italic');
      cx = x - hw + 2;
      cy = y;
      if((ub < VM.PLUS_INFINITY || prod.upper_bound.defined) &&
          (lb > VM.MINUS_INFINITY)) {
        const dif = (ub - lb) / (ub > VM.NEAR_ZERO ? ub : 1);
        if(Math.abs(dif) < VM.SIG_DIF_LIMIT) {
          s = '=' + VM.sig4Dig(ub);
        } else {
          cy -= 5;
          s = '\u2264' + VM.sig4Dig(ub); // Unicode for LE
          // NOTE: use anchor to align text to the left side
          prod.shape.addNumber(cx, cy, s, {fill:'black', 'text-anchor':'start',
              'font-weight':fw, 'font-style':ubfs});
          cy += 10;
          s = '\u2265' + VM.sig4Dig(lb); // Unicode for GE
        }
      } else {
        // NOTE: also display special values (>> -1e+40) when bound expression
        // is not empty
        if(ub < VM.PLUS_INFINITY || prod.upper_bound.defined) {
          s = '\u2264' + VM.sig4Dig(ub); // Unicode for LE
        } else if(lb > VM.MINUS_INFINITY) {
          s = '\u2265' + VM.sig4Dig(lb); // Unicode for GE
        }
      }
      // NOTE: use anchor to align text to the left side
      prod.shape.addNumber(cx, cy, s, {fill: 'black', 'text-anchor': 'start',
          'font-weight': fw, 'font-style': lbfs});
    }
    
    // ALWAYS draw product name
    // NOTE: import/export products have a dotted underscore; export in bold,
    // import in oblique
    prod.shape.addText(x, y - 3, prod.name_lines,
        this.io_formats[MODEL.ioType(prod)]);
    if(MODEL.show_block_arrows && !ignored) {
      // Add block arrows for hidden input and output links (no IO for products)
      prod.shape.addBlockArrow(x - hw + 7, y - hh/2 - 3,
          UI.BLOCK_IN, prod.hidden_inputs.length);
      prod.shape.addBlockArrow(x + hw - 10, y - hh/2 - 3,
          UI.BLOCK_OUT, prod.hidden_outputs.length);
    }
    // Highlight shape if it has comments
    prod.shape.element.firstChild.setAttribute('style',
        (DOCUMENTATION_MANAGER.visible && prod.comments ?
            this.documented_filter : ''));
    prod.shape.element.setAttribute('opacity', 0.9);
    prod.shape.appendToDOM();
  }
  
  drawCluster(clstr, dx=0, dy=0) {
    // Clear previous drawing
    clstr.shape.clear();
    // NOTE: do not draw cluster unless it is a node in the focal cluster
    if(MODEL.focal_cluster.sub_clusters.indexOf(clstr) < 0) return;
    const ignored = MODEL.ignored_entities[clstr.identifier];
    let stroke_color = (ignored ? this.palette.ignore : this.palette.node_rim),
        stroke_width = 1,
        shadow_width = 3,
        fill_color = 'white',
        font_color = 'black';
    if(clstr.selected) {
      stroke_color = this.palette.select;
      stroke_width = 2;
    }
    let w = clstr.width,
        h = clstr.height;
    if(clstr.collapsed) {
      w = 24;
      h = 24;
    }
    if(clstr.is_black_boxed) {
      fill_color = '#201828';
      font_color = 'white';
    } else if(clstr.black_box) {
      fill_color = '#504858';
      font_color = 'white';
    }
    // Clusters are displayed as squares having a shadow (having width sw = 3 pixels)
    const
        hw = w / 2,
        hh = h / 2,
        x = clstr.x + dx,
        y = clstr.y + dy;
    // Draw "shadows"
    clstr.shape.addPath(['m', x + hw - shadow_width, ',', y - hh + shadow_width,
        'h', shadow_width, 'v', h - shadow_width,
        'h-', w - shadow_width, 'v-', shadow_width,
        'h', w - 2*shadow_width, 'z'],
        {fill:stroke_color, stroke:stroke_color, 'stroke-width':stroke_width});
    // Set fill color if slack used by some product contained by this cluster
    if(MODEL.t in clstr.slack_info) {
      const s = clstr.slack_info[MODEL.t];
      if(s.GE.length > 0) {
        fill_color = (s.LE.length > 0 ?
            // Show to-color gradient if both types of slack are used
            this.red_blue_gradient : this.palette.below_lower_bound);
      } else if(s.LE.length > 0) {
        fill_color = this.palette.above_upper_bound;
      }
    }
    // Draw frame
    clstr.shape.addPath(['m', x - hw, ',', y - hh,
        'h', w - shadow_width,
        'v', h - shadow_width, 'h-', w - shadow_width, 'z'],
        {fill: fill_color, stroke: stroke_color, 'stroke-width': stroke_width});
    if(clstr.ignore) {
      // Draw diagonal cross
      clstr.shape.addPath(['m', x - hw + 6, ',', y - hh + 6,
          'l', w - 12 - shadow_width, ',', h - 12 - shadow_width,
          'm', 12 - w + shadow_width, ',0',
          'l', w - 12 - shadow_width, ',', 12 - h + shadow_width],
          {stroke: this.palette.ignore, 'stroke-width': 6,
              'stroke-linecap': 'round'});
    }
    if(!clstr.collapsed) {
      // Draw text
      const
          lcnt = clstr.name_lines.split('\n').length,
          cy = (clstr.hasActor ? y - 12 / (lcnt + 1) : y);
      clstr.shape.addText(x, cy, clstr.name_lines,
          {fill:font_color, 'font-size':12});
      if(clstr.hasActor) {
        const
            th = lcnt * this.font_heights[12],
            anl = UI.stringToLineArray(clstr.actor.name, hw * 1.7, 12),
            format = Object.assign({},
                this.io_formats[MODEL.ioType(clstr.actor)],
                {'font-size': 12, fill: this.palette.actor_font,
                    'font-style': 'italic'});
        let any = cy + th/2 + 7;
        for(let i = 0; i < anl.length; i++) {
          clstr.shape.addText(x, any, anl[i], format);
          any += 12;
        }
      }
    }
    if(MODEL.show_block_arrows && !ignored) {
      // Add block arrows for hidden IO links
      clstr.shape.addBlockArrow(x - hw + 3, y - hh + 15, UI.BLOCK_IN,
          clstr.hidden_inputs.length);
      clstr.shape.addBlockArrow(x + hw - 4, y - hh + 15, UI.BLOCK_OUT,
          clstr.hidden_outputs.length);
      clstr.shape.addBlockArrow(x, y - hh, UI.BLOCK_IO,
          clstr.hidden_io.length);
    }
    // Highlight shape if it has comments
    clstr.shape.element.firstChild.setAttribute('style',
        (DOCUMENTATION_MANAGER.visible && clstr.comments ?
            this.documented_filter : ''));
    // Highlight cluster if it is the drop target for the selection
    if(clstr === this.target_cluster) {
      clstr.shape.element.setAttribute('style', this.target_filter);
    } else {
      clstr.shape.element.setAttribute('style', '');
    }
    clstr.shape.element.setAttribute('opacity', 0.9);
    clstr.shape.appendToDOM();    
  }
  
  drawNote(note, dx=0, dy=0) {
    // NOTE: call resize if text contains fields, as text determines size
    if(!note.parsed) note.parseFields();
    note.resize();
    const
        x = note.x + dx,
        y = note.y + dy,
        w = note.width,
        h = note.height;
    let stroke_color, stroke_width;
    if(note.selected) {
      stroke_color = this.palette.select;
      stroke_width = 1.6;
    } else {
      stroke_color = this.palette.note_rim;
      stroke_width = 0.6;
    }
    let clr = note.color.result(MODEL.t);
    if(clr < 0 || clr >= this.palette.note_fill.length) {
      clr = 0;
    } else {
      clr = Math.round(clr);
    }
    note.shape.clear();
    note.shape.addRect(x, y, w, h,
        {fill: this.palette.note_fill[clr], opacity: 0.75, stroke: stroke_color,
            'stroke-width': stroke_width, rx: 4, ry: 4});
    note.shape.addRect(x, y, w-2, h-2,
        {fill: 'none', stroke: this.palette.note_band[clr], 'stroke-width': 1.5,
            rx: 3, ry: 3});
    note.shape.addText(x - w/2 + 4, y, note.lines,
        {fill: (clr === 5 ? 'black' : this.palette.note_font), 'text-anchor': 'start'});
    note.shape.appendToDOM();
  }
  
} // END of class Paper


// CLASS ModalDialog provides basic modal dialog functionality
class ModalDialog {
  constructor(id) {
    this.id = id;
    this.modal = document.getElementById(id + '-modal');
    this.dialog = document.getElementById(id + '-dlg');
    // NOTE: dialog button properties will be `undefined` if not in the header
    this.ok = this.dialog.getElementsByClassName('ok-btn')[0];
    this.cancel = this.dialog.getElementsByClassName('cancel-btn')[0];
    this.info = this.dialog.getElementsByClassName('info-btn')[0];
    this.close = this.dialog.getElementsByClassName('close-btn')[0];
  }
  
  element(name) {
    // Returns named element within this dialog
    return document.getElementById(this.id + '-' + name);
  }
  
  selectedOption(name) {
    // Returns the selected option element of named selector
    const sel = document.getElementById(this.id + '-' + name);
    return sel.options[sel.selectedIndex];
  }

  show(name=null) {
    // Makes dialog visible and focuses on element with  `focal`
    this.modal.style.display = 'block';
    if(name) this.element(name).focus();
  }
  
  hide() {
    // Makes dialog invisible
    this.modal.style.display = 'none';
  }

} // END of class ModalDialog


// CLASS GUIController implements the Linny-R GUI
class GUIController extends Controller {
  constructor() {
    super();
    this.console = false;
    // Display version number as clickable link (just below the Linny-R logo)
    this.version_number = LINNY_R_VERSION;
    this.version_div = document.getElementById('linny-r-version-number');
    this.version_div.innerHTML = 'Version ' + this.version_number;
    // Initialize the "paper" for drawing the model diagram
    this.paper = new Paper();
    // Block arrows on nodes come in three types
    this.BLOCK_IN = 1;
    this.BLOCK_OUT = 2;
    this.BLOCK_IO = 3;
    // Used to avoid too frequent redrawing of the SVG model diagram
    this.busy_drawing = false;
    this.draw_requests = 0;
    this.busy_drawing_selection = false;
    this.selection_draw_requests = 0;
    // The "edited object" is set when the properties modal of the selected
    // entity is opened with double-click or Alt-click
    this.edited_object = null;
    // Initialize mouse/cursor control properties
    this.mouse_x = 0;
    this.mouse_y = 0;
    this.mouse_down_x = 0;
    this.mouse_down_y = 0;
    this.move_dx = 0;
    this.move_dy = 0;
    this.start_sel_x = -1;
    this.start_sel_y = -1;
    this.add_x = 0;
    this.add_y = 0;
    this.on_node = null;
    this.on_arrow = null;
    this.on_link = null;
    this.on_constraint = null;
    this.on_cluster = null;
    this.on_cluster_edge = false;
    this.on_note = null;
    this.on_block_arrow = null;
    this.linking_node = null;
    this.dragged_node = null;
    this.node_to_move = null;
    this.constraining_node = null;
    this.dbl_clicked_node = null;
    this.target_cluster = null;
    this.constraint_under_cursor = null;
    this.last_up_down_without_move = Date.now();
    // Keyboard shortcuts: Ctrl-x associates with menu button ID
    this.shortcuts = {
      'A': 'actors',
      'B': 'repository', // B for "Browse"
      'C': 'clone',
      'D': 'dataset',
      'E': 'equation',
      'F': 'finder',
      'G': 'savediagram', // G for "Graph" (as Scalable Vector Graphics image)
      'H': 'receiver',  // activate receiver (H for "Host")
      'I': 'documentation',
      'J': 'sensitivity', // J for "Jitter"
      'K': 'reset', // reset model and clear results from graph
      'L': 'load',
      'M': 'monitor',
      // Ctrl-N will still open a new browser window
      'O': 'chart',  // O for "Output", as it can be charts as wel as data 
      'P': 'diagram', // P for PNG (Portable Network Graphics image)
      'Q': 'stop',
      'R': 'solve', // runs the simulation
      'S': 'save',
      // Ctrl-T will still open a new browser tab
      'U': 'parent',  // U for "move UP in cluster hierarchy"
      'V': 'settings',
      // Ctrl-W will still close the browser window
      'X': 'experiment',
      'Y': 'redo',
      'Z': 'undo',
    };

    // Initialize controller buttons
    this.node_btns = ['process', 'product', 'link', 'constraint',
        'cluster', 'module', 'note'];
    this.edit_btns = ['clone', 'delete', 'undo', 'redo'];
    this.model_btns = ['settings', 'save', 'repository', 'actors', 'dataset',
        'equation', 'chart', 'sensitivity', 'experiment', 'diagram',
        'savediagram', 'finder', 'monitor', 'solve'];
    this.other_btns = ['new', 'load', 'receiver', 'documentation', 'parent',
        'lift', 'solve', 'stop', 'reset', 'zoomin', 'zoomout',
        'stepback', 'stepforward', 'autosave', 'recall'];
    this.all_btns = this.node_btns.concat(
        this.edit_btns, this.model_btns, this.other_btns);
    // Add all button DOM elements as controller properties
    for(let i = 0; i < this.all_btns.length; i++) {
      const b = this.all_btns[i];
      this.buttons[b] = document.getElementById(b + '-btn');
    }
    this.active_button = null;

    // Also identify the elements related to the focal cluster
    this.focal_cluster = document.getElementById('focal-cluster');
    this.focal_black_box = document.getElementById('focal-black-box');
    this.focal_name = document.getElementById('focal-name');
    
    // Keep track of time since last message displayed on the infoline
    this.time_last_message = new Date('01 Jan 2001 00:00:00 GMT');
    this.message_display_time = 3000;

    // Initialize "main" modals, i.e., those that relate to the controller,
    // not to other dialog objects
    this.main_modals = ['logon', 'model', 'load', 'password', 'settings',
        'actors', 'add-process', 'add-product', 'cluster', 'move',
        'note', 'link', 'constraint', 'process', 'product', 'clone', 
        'replace', 'expression'];
    for(let i = 0; i < this.main_modals.length; i++) {
      const mid = this.main_modals[i];
      this.modals[mid] = new ModalDialog(mid);
    }
    // Initialize draggable dialogs
    this.dr_dialog = null; // the dialog being dragged or resized
    this.dr_dialog_order = []; // sorted by z-index
  }
  
  get color() {
    // This method permits shorthand: UI.color.xxx
    return this.paper.palette;
  }
  
  removeListeners(el) {
    // Removes all event listeners from DOM element `el`
    const clone = el.cloneNode(true);
    el.parentNode.replaceChild(clone, el);
    return clone;
  }
  
  addListeners() {
    // NOTE: cc stands for "canvas container"; this holds the model diagram SVG
    this.cc = document.getElementById('cc');
    this.cc.addEventListener('mousemove', (event) => UI.mouseMove(event));
    this.cc.addEventListener('mouseup', (event) => UI.mouseUp(event));
    this.cc.addEventListener('mousedown', (event) => UI.mouseDown(event));
    // NOTE: responding to `mouseenter` is needed to update the cursor position
    // after closing a modal dialog
    this.cc.addEventListener('mouseenter', (event) => UI.mouseMove(event));

    // Disable dragging on all images
    const
        imgs = document.getElementsByTagName('img'),
        nodrag = (event) => { event.preventDefault(); return false; };
    for(let i = 0; i < imgs.length; i++) {          
      imgs[i].addEventListener('dragstart', nodrag);
    }

    // Make all buttons respond to a mouse click
    this.buttons['new'].addEventListener('click',
        () => UI.promptForNewModel());
    this.buttons.load.addEventListener('click',
        () => FILE_MANAGER.promptToLoad());
    this.buttons.settings.addEventListener('click',
        () => UI.showSettingsDialog(MODEL));
    this.buttons.save.addEventListener('click',
        () => FILE_MANAGER.saveModel());
    this.buttons.actors.addEventListener('click',
        () => ACTOR_MANAGER.showDialog());
    this.buttons.diagram.addEventListener('click',
        () => FILE_MANAGER.renderDiagramAsPNG());
    this.buttons.savediagram.addEventListener('click',
        () => FILE_MANAGER.saveDiagramAsSVG());
    this.buttons.receiver.addEventListener('click',
        () => RECEIVER.toggle());
    // NOTE: all draggable & resizable dialogs "toggle" show/hide
    const tdf = (event) => UI.toggleDialog(event);
    this.buttons.repository.addEventListener('click', tdf);
    this.buttons.dataset.addEventListener('click', tdf);
    this.buttons.equation.addEventListener('click', tdf);
    this.buttons.chart.addEventListener('click', tdf);
    this.buttons.sensitivity.addEventListener('click', tdf);
    this.buttons.experiment.addEventListener('click', tdf);
    this.buttons.finder.addEventListener('click', tdf);
    this.buttons.monitor.addEventListener('click', tdf);
    this.buttons.documentation.addEventListener('click', tdf);
    // Cluster navigation elements
    this.focal_name.addEventListener('click',
        () => UI.showClusterPropertiesDialog(MODEL.focal_cluster));
    this.focal_name.addEventListener('mousemove',
        () => DOCUMENTATION_MANAGER.update(MODEL.focal_cluster, true));
    this.buttons.parent.addEventListener('click',
        () => UI.showParentCluster());
    this.buttons.lift.addEventListener('click',
        () => UI.moveSelectionToParentCluster());
    // Local host button (on far right of top horizontal tool bar)
    if(!SOLVER.user_id) {
      // NOTE: when user name is specified, solver is not on local host
      const hl = document.getElementById('host-logo');
      hl.classList.add('local-server');
      hl.addEventListener('click', () => UI.shutDownServer());
    }
    // Vertical tool bar buttons
    this.buttons.clone.addEventListener('click',
        () => UI.promptForCloning());
    this.buttons['delete'].addEventListener('click',
        () => {
          UNDO_STACK.push('delete');
          MODEL.deleteSelection();
          UI.updateButtons();
        });
    this.buttons.undo.addEventListener('click',
        () => {
          if(UI.buttons.undo.classList.contains('enab')) {
            UNDO_STACK.undo();
            UI.updateButtons();
          }
        });
    this.buttons.redo.addEventListener('click',
        () => {
          if(UI.buttons.redo.classList.contains('enab')) {
            UNDO_STACK.redo();
            UI.updateButtons();
          }
        });
    this.buttons.solve.addEventListener('click', () => VM.solveModel());
    this.buttons.stop.addEventListener('click', () => VM.halt());
    this.buttons.reset.addEventListener('click', () => UI.resetModel());
    // Bottom-line GUI elements
    this.buttons.zoomin.addEventListener('click', () => UI.paper.zoomIn());
    this.buttons.zoomout.addEventListener('click', () => UI.paper.zoomOut());
    this.buttons.stepback.addEventListener('click',
        (event) => UI.stepBack(event));
    this.buttons.stepforward.addEventListener('click',
        (event) => UI.stepForward(event));
    this.buttons.recall.addEventListener('click',
        // Recall button toggles the documentation dialog
        () => UI.buttons.documentation.dispatchEvent(new Event('click')));
    this.buttons.autosave.addEventListener('click',
        // NOTE: TRUE indicates "show dialog after obtaining the model list"
        () => AUTO_SAVE.getAutoSavedModels(true));
    this.buttons.autosave.addEventListener('mouseover',
        () => AUTO_SAVE.getAutoSavedModels());

    // Make "stay active" buttons respond to Shift-click
    const
        tbs = document.getElementsByClassName('toggle'),
        tf = (event) => UI.toggleButton(event);
    for(let i = 0; i < tbs.length; i++) {          
      tbs[i].addEventListener('click', tf);
    }

    // Add listeners to OK and CANCEL buttons on main modal dialogs
    this.modals.logon.ok.addEventListener('click',
        () => {
            const
                usr = UI.modals.logon.element('name').value,
                pwd = UI.modals.logon.element('password').value;
            // Always hide the modal dialog
            UI.modals.logon.hide();
            MONITOR.logOnToServer(usr, pwd);
          });
    this.modals.logon.cancel.addEventListener('click',
        () => {
            UI.modals.logon.hide();
            UI.warn('Not connected to solver');
          });

    this.modals.model.ok.addEventListener('click',
        () => UI.createNewModel());
    this.modals.model.cancel.addEventListener('click',
        () => UI.modals.model.hide());

    this.modals.load.ok.addEventListener('click',
        () => FILE_MANAGER.loadModel());
    this.modals.load.cancel.addEventListener('click',
        () => UI.modals.load.hide());
    this.modals.load.element('autosaved-btn').addEventListener('click',
        () => AUTO_SAVE.showRestoreDialog());

    // NOTE: encryption-related variables are stores as properties of the
    // password modal dialog
    this.modals.password.encryption_code = '';
    this.modals.password.encrypted_msg = null;
    this.modals.password.post_decrypt_action = null;
    this.modals.password.cancel.addEventListener('click',
        () => UI.modals.password.hide());
    this.modals.password.element('code').addEventListener('input',
        () => FILE_MANAGER.updateStrength());

    this.modals.settings.ok.addEventListener('click',
        () => UI.updateSettings(MODEL));
    // NOTE: settings dialog has an information button in its header
    this.modals.settings.info.addEventListener('click',
        () => {
            // Open the documentation manager if still closed
            if(!DOCUMENTATION_MANAGER.visible) {
              UI.buttons.documentation.dispatchEvent(new Event('click'));
            }
            DOCUMENTATION_MANAGER.update(MODEL, true);
          });
    this.modals.settings.cancel.addEventListener('click',
        () => {
            UI.modals.settings.hide();
            // Ensure that model documentation can no longer be edited
            DOCUMENTATION_MANAGER.clearEntity([MODEL]);
          });

    // Modals related to vertical toolbar buttons
    this.modals['add-process'].ok.addEventListener('click',
        () => UI.addNode('process'));
    this.modals['add-process'].cancel.addEventListener('click',
        () => UI.modals['add-process'].hide());
    this.modals['add-product'].ok.addEventListener('click',
        () => UI.addNode('product'));
    this.modals['add-product'].cancel.addEventListener('click',
        () => UI.modals['add-product'].hide());
    this.modals.cluster.ok.addEventListener('click',
        () => UI.addNode('cluster'));
    this.modals.cluster.cancel.addEventListener('click',
        () => UI.modals.cluster.hide());

    // NOTES:
    // (1) Use shared functions for process & product dialog events
    // (2) The "edit expression" buttons provide sufficient info via the event
    const
        eoxedit = (event) => X_EDIT.editExpression(event),
        eodocu = () => DOCUMENTATION_MANAGER.update(UI.edited_object, true),
        eoteqb = (event) => UI.toggleEqualBounds(event);

    this.modals.note.ok.addEventListener('click',
        () => UI.addNode('note'));
    this.modals.note.cancel.addEventListener('click',
        () => UI.modals.note.hide());
    // Notes have 1 expression property ()
    this.modals.note.element('C-x').addEventListener('click', eoxedit);
    // NOTE: the properties dialog for process, product, cluster and link
    // also respond to `mousemove` to show documentation
    this.modals.process.ok.addEventListener('click',
        () => UI.updateProcessProperties());
    this.modals.process.cancel.addEventListener('click',
        () => UI.modals.process.hide());
    this.modals.process.dialog.addEventListener('mousemove', eodocu);
    this.modals.process.element('UB-equal').addEventListener('click', eoteqb);
    // Processes have 4 expression properties
    this.modals.process.element('LB-x').addEventListener('click', eoxedit);
    this.modals.process.element('UB-x').addEventListener('click', eoxedit);
    this.modals.process.element('IL-x').addEventListener('click', eoxedit);
    this.modals.process.element('pace-x').addEventListener('click', eoxedit);

    this.modals.product.ok.addEventListener('click',
        () => UI.updateProductProperties());
    this.modals.product.cancel.addEventListener('click',
        () => UI.modals.product.hide());
    this.modals.product.dialog.addEventListener('mousemove', eodocu);
    this.modals.product.element('UB-equal').addEventListener('click', eoteqb);
    // Product stock box performs action => wait for box to update its state
    document.getElementById('stock').addEventListener('click',
        () => setTimeout(() => UI.toggleProductStock(), 10));
    // Products have 4 expression properties
    this.modals.product.element('LB-x').addEventListener('click', eoxedit);
    this.modals.product.element('UB-x').addEventListener('click', eoxedit);
    this.modals.product.element('IL-x').addEventListener('click', eoxedit);
    this.modals.product.element('P-x').addEventListener('click', eoxedit);
    // Products have an import/export togglebox
    this.modals.product.element('io').addEventListener('click',
        () => UI.toggleImportExportBox('product'));

    this.modals.link.ok.addEventListener('click',
        () => UI.updateLinkProperties());
    this.modals.link.cancel.addEventListener('click',
        () => UI.modals.link.hide());
    this.modals.link.dialog.addEventListener('mousemove',
        () => DOCUMENTATION_MANAGER.update(UI.on_link, true));
    this.modals.link.element('multiplier').addEventListener('change',
        () => UI.updateLinkDataArrows());
    // Links have 2 expression properties
    this.modals.link.element('R-x').addEventListener('click', eoxedit);
    this.modals.link.element('D-x').addEventListener('click', eoxedit);

    this.modals.clone.ok.addEventListener('click',
        () => UI.cloneSelection());
    this.modals.clone.cancel.addEventListener('click',
        () => UI.cancelCloneSelection());

    // The MOVE dialog can appear when a process or cluster is added
    this.modals.move.ok.addEventListener('click',
        () => UI.moveNodeToFocalCluster());
    this.modals.move.cancel.addEventListener('click',
        () => UI.doNotMoveNode());
    
    // The REPLACE dialog appears when a product is Ctrl-clicked
    this.modals.replace.ok.addEventListener('click',
        () => UI.replaceProduct());
    this.modals.replace.cancel.addEventListener('click',
        () => UI.modals.replace.hide());
    
    this.check_update_modal = new ModalDialog('check-update');
    this.check_update_modal.ok.addEventListener('click',
        () => UI.shutDownServer());
    this.check_update_modal.cancel.addEventListener('click',
        () => UI.check_update_modal.hide());

    // Add all draggable stay-on-top dialogs as controller properties
    
    // Make checkboxes respond to click
    // NOTE: checkbox-specific events must be bound AFTER this general setting
    const
        cbs = document.getElementsByClassName('box'),
        cbf = (event) => UI.toggleBox(event);
    for(let i = 0; i < cbs.length; i++) {          
      cbs[i].addEventListener('click', cbf);
    }
    // Make infoline respond to `mouseenter`
    this.info_line = document.getElementById('info-line');
    this.info_line.addEventListener('mouseenter',
        (event) => DOCUMENTATION_MANAGER.showInfoMessages(event.shiftKey));
    // Ensure that all modal windows respond to ESCape
    // (and more in general to other special keys)
    document.addEventListener('keydown', (event) => UI.checkModals(event));
  }
  
  setConstraintUnderCursor(c) {
    // Sets constraint under cursor (CUC) (if any) and records time of event
    this.constraint_under_cursor = c;
    this.cuc_x = this.mouse_x;
    this.cuc_y = this.mouse_y;
    this.last_cuc_change = new Date().getTime();
  }
  
  constraintStillUnderCursor() {
    // Returns CUC, but possibly after setting it to NULL because mouse has
    // moved significantly and CUC was detected more than 300 msec ago
    // NOTE: this elaborate check was added to deal with constraint shapes
    // not always generating mouseout events (due to rapid mouse movements?) 
    const
        dx = Math.abs(this.cuc_x - this.mouse_x),
        dy = Math.abs(this.cuc_y - this.mouse_y);
    if(dx + dy > 5 && new Date().getTime() - this.last_cuc_change > 300) {
      this.constraint_under_cursor = null;
    }
    return this.constraint_under_cursor;
  }

  updateControllerDialogs(letters) {
    if(letters.indexOf('B') >= 0) REPOSITORY_BROWSER.updateDialog();
    if(letters.indexOf('C') >= 0) CHART_MANAGER.updateDialog();
    if(letters.indexOf('D') >= 0) DATASET_MANAGER.updateDialog();
    if(letters.indexOf('E') >= 0) EQUATION_MANAGER.updateDialog();
    if(letters.indexOf('F') >= 0) FINDER.changeFilter();
    if(letters.indexOf('I') >= 0) DOCUMENTATION_MANAGER.updateDialog();
    if(letters.indexOf('J') >= 0) SENSITIVITY_ANALYSIS.updateDialog();
    if(letters.indexOf('X') >= 0) EXPERIMENT_MANAGER.updateDialog();
  }

  loadModelFromXML(xml) {
    // Parses `xml` and updates the GUI 
    const loaded = MODEL.parseXML(xml);
    // If not a valid Linny-R model, ensure that the current model is clean 
    if(!loaded) MODEL = new LinnyRModel();
    this.drawDiagram(MODEL);
    // Cursor may have been set to `waiting` when decrypting
    this.normalCursor();
    this.setMessage('');
    this.updateButtons();
    // Undoable operations no longer apply!
    UNDO_STACK.clear();
    // Autosaving should start anew
    AUTO_SAVE.setAutoSaveInterval();
    // Signal success or failure
    return loaded;
  }
  
  makeFocalCluster(c) {
    if(c.is_black_boxed) {
      this.notify('Black-boxed clusters cannot be viewed');
      return;
    }
    let fc = MODEL.focal_cluster;
    MODEL.focal_cluster = c;
    MODEL.clearSelection();
    this.paper.drawModel(MODEL);
    this.updateButtons();
    // NOTE: when "moving up" in the cluster hierarchy, bring the former focal
    // cluster into view
    if(fc.cluster == MODEL.focal_cluster) {
      this.scrollIntoView(fc.shape.element.childNodes[0]);
    }
  }
  
  drawDiagram(mdl) {
    // "Queue" a draw request (to avoid redrawing too often)
    if(this.busy_drawing) {
      this.draw_requests += 1;
    } else {
      this.draw_requests = 0;
      this.busy_drawing = true;
      this.paper.drawModel(mdl);
      this.busy_drawing = false;
    }
  }

  drawSelection(mdl) {
    // "Queue" a draw request (to avoid redrawing too often)
    if(this.busy_drawing_selection) {
      this.selection_draw_requests += 1;
    } else {
      this.selection_draw_requests = 0;
      this.busy_drawing_selection = true;
      this.paper.drawSelection(mdl);
      this.busy_drawing_selection = false;
    }
  }
  
  drawObject(obj) {
    if(obj instanceof Process) {
      this.paper.drawProcess(obj);
    } else if(obj instanceof Product) {
      this.paper.drawProduct(obj);
    } else if(obj instanceof Cluster) {
      this.paper.drawCluster(obj);
    } else if(obj instanceof Arrow) {
      this.paper.drawArrow(obj);
    } else if(obj instanceof Constraint) {
      this.paper.drawConstraint(obj);
    } else if(obj instanceof Note) {
      this.paper.drawNote(obj);
    }
  }

  drawLinkArrows(cluster, link) {
    // Draw all arrows in `cluster` that represent `link`
    for(let i = 0; i < cluster.arrows.length; i++) {
      const a = cluster.arrows[i];
      if(a.links.indexOf(link) >= 0) this.paper.drawArrow(a);
    }    
  }

  shutDownServer() {
    // Shut down -- this terminates the local host server script 
    if(!SOLVER.user_id) window.open('./shutdown', '_self');
  }

  loginPrompt() {
    // Show the server logon modal
    this.modals.logon.element('name').value = SOLVER.user_id;
    this.modals.logon.element('password').value = '';
    this.modals.logon.show('password');
  }
  
  rotatingIcon(rotate=false) {
    // Controls the appearance of the Linny-R icon (top-left in browser window)
    const
        si = document.getElementById('static-icon'),
        ri = document.getElementById('rotating-icon');
    if(rotate) {
      si.style.display = 'none';
      ri.style.display = 'block';
    } else {
      ri.style.display = 'none';
      si.style.display = 'block';
    }
  }

  updateTimeStep(t=MODEL.simulationTimeStep) {
    // Displays `t` as the current time step
    // NOTE: the Virtual Machine passes its relative time VM.t
    document.getElementById('step').innerHTML = t;
  }
  
  stopSolving() {
    // Reset solver-related GUI elements and notify modeler
    super.stopSolving();
    this.buttons.solve.classList.remove('off');
    this.buttons.stop.classList.remove('blink');
    this.buttons.stop.classList.add('off');
    this.rotatingIcon(false);
    // Update the time step on the status bar
    this.updateTimeStep();
  }
  
  readyToSolve() {
    // Set Stop and Reset buttons to their initial state
    UI.buttons.stop.classList.remove('blink');
    // Hide the reset button
    UI.buttons.reset.classList.add('off');   
  }
  
  startSolving() {
    // Hide Start button and show Stop button
    UI.buttons.solve.classList.add('off');
    UI.buttons.stop.classList.remove('off');
  }
  
  waitToStop() {
    // Make Stop button blink to indicate "halting -- please wait"
    UI.buttons.stop.classList.add('blink');
  }
  
  readyToReset() {
    // Show the Reset button
    UI.buttons.reset.classList.remove('off');
  }

  reset() {
    // Reset properties related to cursor position on diagram 
    this.on_node = null;
    this.on_arrow = null;
    this.on_cluster = null;
    this.on_cluster_edge = false;
    this.on_link = null;
    this.on_constraint = null;
    this.on_note = null;
    this.on_block_arrow = false;
    this.dragged_node = null;
    this.linking_node = null;
    this.constraining_node = null;
    this.start_sel_x = -1;
    this.start_sel_y = -1;
  }

  get doubleClicked() {
    // Return TRUE when a "double-click" occurred
    const
        now = Date.now(),
        dt = now - this.last_up_down_without_move;
    this.last_up_down_without_move = now;
    // Consider click to be "double" if it occurred less than 300 ms ago
    if(dt < 300) {
      this.last_up_down_without_move = 0;
      return true;
    }
    return false;
  }
  
  hidden(id) {
    // Returns TRUE if element is not shown
    const el = document.getElementById(id);
    return window.getComputedStyle(el).display === 'none';
  }
  
  toggle(id, display='block') {
    // Hides element if shown; otherwise sets display mode
    const
        el = document.getElementById(id),
        h = window.getComputedStyle(el).display === 'none';
    el.style.display = (h ? display : 'none');
  }
  
  scrollIntoView(e) {
    // Scrolls container of DOM element `e` such that it becomes visible
    if(e) e.scrollIntoView({block: 'nearest', inline: 'nearest'});
  }

  //
  // Methods related to draggable & resizable dialogs
  //
  
  toggleDialog(e) {
    e = e || window.event;
    e.preventDefault();
    e.stopImmediatePropagation();
    // Infer dialog identifier from target element
    const
        dlg = e.target.id.split('-')[0],
        tde = document.getElementById(dlg + '-dlg'),
        was_hidden = this.hidden(tde.id);
    let mgr = tde.getAttribute('data-manager');
    if(mgr) mgr = window[mgr];
    // NOTE: prevent modeler from viewing charts while an experiment is running
    if(dlg === 'chart' && was_hidden && MODEL.running_experiment) {
      UI.notify(UI.NOTICE.NO_CHARTS);
      mgr.visible = false;
      return;
    }
    this.toggle(tde.id);
    if(mgr) mgr.visible = was_hidden;
    // Open at position after last drag (recorded in DOM data attributes)
    let t = tde.getAttribute('data-top'),
        l = tde.getAttribute('data-left');
    // Make dialog appear in screen center the first time it is shown
    if(t === null || l === null) {
      const cs = window.getComputedStyle(tde);
      t = ((window.innerHeight - parseFloat(cs.height)) / 2) + 'px';
      l = ((window.innerWidth - parseFloat(cs.width)) / 2) + 'px';
      tde.style.top = t;
      tde.style.left = l;
    }
    if(!this.hidden(tde.id)) {
      // Add dialog to "showing" list, and adjust z-indices
      this.dr_dialog_order.push(tde);
      this.reorderDialogs();
      // Update the diagram if its manager has been specified
      if(mgr) {
        mgr.visible = true;
        mgr.updateDialog();
        if(mgr === DOCUMENTATION_MANAGER) {
          if(this.info_line.innerHTML.length === 0) {
            mgr.title.innerHTML = 'About Linny-R';
            mgr.viewer.innerHTML = mgr.about_linny_r;
            mgr.edit_btn.classList.remove('enab');
            mgr.edit_btn.classList.add('disab');
          }
          UI.drawDiagram(MODEL);
        }
      }
    } else {
      const doi = this.dr_dialog_order.indexOf(tde);
      // NOTE: doi should ALWAYS be >= 0 because dialog WAS showing
      if(doi >= 0) {
        this.dr_dialog_order.splice(doi, 1);
        this.reorderDialogs();
      }
      if(mgr) {
        mgr.visible = true;
        if(mgr === DOCUMENTATION_MANAGER) {
          mgr.visible = false;
          mgr.title.innerHTML = 'Documentation';
          UI.drawDiagram(MODEL);
        }
      }
    }
    UI.buttons[dlg].classList.toggle('stay-activ');
  }
  
  reorderDialogs() {
    let z = 10;
    for(let i = 0; i < this.dr_dialog_order.length; i++) {
      this.dr_dialog_order[i].style.zIndex = z;
      z += 5;
    }
  }
  
  draggableDialog(d) {
    // Make dialog draggable
    const
        dlg = document.getElementById(d + '-dlg'),
        hdr = document.getElementById(d + '-hdr');
    let cx = 0,
        cy = 0;
    if(dlg && hdr) {
      // NOTE: dialogs are draggable only by their header
      hdr.onmousedown = dialogHeaderMouseDown;
      dlg.onmousedown = dialogMouseDown;
      return dlg;
    } else {
      console.log('ERROR: No draggable header element');
      return null;
    }
    
    function dialogMouseDown(e) {
      e = e || window.event;
      // NOTE: no `preventDefault` so the header will also receive it
      // Find the dialog element
      let de = e.target;
      while(de && !de.id.endsWith('-dlg')) { de = de.parentElement; }
      // Moves the dialog (`this`) to the top of the order
      const doi = UI.dr_dialog_order.indexOf(de);
      // NOTE: do not reorder when already at end of list (= at top)
      if(doi >= 0 && doi !== UI.dr_dialog_order.length - 1) {
        UI.dr_dialog_order.splice(doi, 1);
        UI.dr_dialog_order.push(de);
        UI.reorderDialogs();
      }
    }
  
    function dialogHeaderMouseDown(e) {
      e = e || window.event;
      e.preventDefault();
      // Find the dialog element
      let de = e.target;
      while(de && !de.id.endsWith('-dlg')) { de = de.parentElement; }
      // Record the affected dialog
      UI.dr_dialog = de;
      // Get the mouse cursor position at startup
      cx = e.clientX;
      cy = e.clientY;
      document.onmouseup = stopDragDialog;
      document.onmousemove = dialogDrag;
    }
  
    function dialogDrag(e) {
      e = e || window.event;
      e.preventDefault();
      // Calculate the relative movement of the mouse cursor...
      const
          dx = cx - e.clientX,
          dy = cy - e.clientY;
      // ... and record the new mouse cursor position
      cx = e.clientX;
      cy = e.clientY;
      // Move the entire dialog, but prevent it from being moved outside the window
      UI.dr_dialog.style.top = Math.min(
          window.innerHeight - 40, Math.max(0, UI.dr_dialog.offsetTop - dy)) + 'px';
      UI.dr_dialog.style.left = Math.min(
          window.innerWidth - 40,
              Math.max(-210, UI.dr_dialog.offsetLeft - dx)) + 'px';
    }
  
    function stopDragDialog() {
      // Stop moving when mouse button is released
      document.onmouseup = null;
      document.onmousemove = null;
      // Preserve position as data attributes
      UI.dr_dialog.setAttribute('data-top', UI.dr_dialog.style.top);
      UI.dr_dialog.setAttribute('data-left', UI.dr_dialog.style.left);
    }
  }
  
  resizableDialog(d, mgr=null) {
    // Make dialog resizable (similar to dragElement above)
    const
        dlg = document.getElementById(d + '-dlg'),
        rsz = document.getElementById(d + '-resize');
    let w = 0,
        h = 0,
        minw = 0,
        minh = 0,
        cx = 0,
        cy = 0;
    if(dlg && rsz) {
      if(mgr) dlg.setAttribute('data-manager', mgr);
      rsz.onmousedown = resizeMouseDown;
    } else {
      console.log('ERROR: No resizing corner element');
      return false;
    }
  
    function resizeMouseDown(e) {
      e = e || window.event;
      e.preventDefault();
      // Find the dialog element
      let de = e.target;
      while(de && !de.id.endsWith('-dlg')) { de = de.parentElement; }
      UI.dr_dialog = de;
      // Get the (min.) weight, (min.) height and mouse cursor position at startup
      const cs = window.getComputedStyle(UI.dr_dialog);
      w = parseFloat(cs.width);
      h = parseFloat(cs.height);
      minw = parseFloat(cs.minWidth);
      minh = parseFloat(cs.minHeight);
      cx = e.clientX;
      cy = e.clientY;
      document.onmouseup = stopResizeDialog;
      document.onmousemove = dialogResize;
    }
  
    function dialogResize(e) {
      e = e || window.event;
      e.preventDefault();
      // Calculate the relative mouse cursor movement
      const
          dw = e.clientX - cx,
          dh = e.clientY - cy;
      // Set the dialog's new size
      UI.dr_dialog.style.width = Math.max(minw, w + dw) + 'px';
      UI.dr_dialog.style.height = Math.max(minh, h + dh) + 'px';
      // Update the dialog if its manager has been specified
      const mgr = UI.dr_dialog.getAttribute('data-manager');
      if(mgr) window[mgr].updateDialog();
    }
  
    function stopResizeDialog() {
      // Stop moving when mouse button is released
      document.onmouseup = null;
      document.onmousemove = null;
    }
  }
  
  //
  // Button functionality
  //
  
  enableButtons(btns) {
    btns = btns.trim().split(/\s+/);
    for(let i = 0; i < btns.length; i++) {
      const b = document.getElementById(btns[i] + '-btn');
      b.classList.remove('disab', 'activ');
      b.classList.add('enab');
    }
  }
  
  disableButtons(btns) {
    btns = btns.trim().split(/\s+/);
    for(let i = 0; i < btns.length; i++) {
      const b = document.getElementById(btns[i] + '-btn'); 
      b.classList.remove('enab', 'activ', 'stay-activ');
      b.classList.add('disab');
    }
  }
  
  updateButtons() {
    // Updates the buttons on the main GUI toolbars
    const
        node_btns = 'process product link constraint cluster note ',
        edit_btns = 'clone delete undo redo ',
        model_btns = 'settings save actors dataset equation chart ' +
            'diagram savediagram finder monitor solve';
    if(MODEL === null) {
      this.disableButtons(node_btns + edit_btns + model_btns);
      return;
    }
    if(MODEL.focal_cluster === MODEL.top_cluster) {
      this.focal_cluster.style.display = 'none';
    } else {
      this.focal_name.innerHTML = MODEL.focal_cluster.displayName;
      if(MODEL.focal_cluster.black_box) {
        this.focal_black_box.style.display = 'inline-block';
      } else {
        this.focal_black_box.style.display = 'none';
      }
      if(MODEL.selection.length > 0) {
        this.enableButtons('lift');
      } else {
        this.disableButtons('lift');
      }
      this.focal_cluster.style.display = 'inline-block';
    }
    this.enableButtons(node_btns + model_btns);
    this.active_button = this.stayActiveButton;
    this.disableButtons(edit_btns);
    if(MODEL.selection.length > 0) this.enableButtons('clone delete');
    // Only allow target seeking when some target or process constraint is defined
    if(MODEL.hasTargets) this.enableButtons('solve');
    var u = UNDO_STACK.canUndo;
    if(u) {
      this.enableButtons('undo');
      this.buttons.undo.title = u;
    } else {
      this.buttons.undo.title = 'Undo not possible';
    }
    u = UNDO_STACK.canRedo;
    if(u) {
      this.enableButtons('redo');
      this.buttons.redo.title = u;
    } else {
      this.buttons.redo.title = 'Redo not possible';
    }
  }
  
  // NOTE: Active buttons allow repeated "clicks" on the canvas
  
  get stayActive() {
    if(this.active_button) {
      return this.active_button.classList.contains('stay-activ');
    }
    return false;
  }
  
  resetActiveButton() {
    if(this.active_button) {
      this.active_button.classList.remove('activ', 'stay-activ');
    }
    this.active_button = null;
  }
  
  get stayActiveButton() {
    // Return the button that is "stay active", or NULL if none 
    const btns = ['process', 'product', 'link', 'constraint', 'cluster', 'note'];
    for(let i = 0; i < btns.length; i++) {
      const b = document.getElementById(btns[i] + '-btn');
      if(b.classList.contains('stay-activ')) return b;
    }
    return null;
  }
  
  toggleButton(e) {
    if(e.target.classList.contains('disab')) return;
    let other = true;
    if(this.active_button) {
      other = (e.target !== this.active_button);
      this.resetActiveButton();
    }
    if(other && (e.target.classList.contains('enab'))) {
      e.target.classList.add((e.shiftKey ? 'stay-activ' : 'activ'));
      this.active_button = e.target;
    }
  }

  //
  // Handlers for mouse/cursor events
  //

  mouseMove(e) {
    // Responds to mouse cursor moving over Linny-R diagram area
    this.on_node = null;
    const cp = this.paper.cursorPosition(e.pageX, e.pageY);
    this.mouse_x = cp[0];
    this.mouse_y = cp[1];
    document.getElementById('pos-x').innerHTML = 'X = ' + this.mouse_x;
    document.getElementById('pos-y').innerHTML = 'Y = ' + this.mouse_y;
    
    // NOTE: check, as MODEL might still be undefined
    if(!MODEL) return;
    
    //console.log(e);
    const fc = MODEL.focal_cluster;
    for(let i = fc.processes.length-1; i >= 0; i--) {
      const obj = fc.processes[i];
      if(obj.containsPoint(this.mouse_x, this.mouse_y)) {
        this.on_node = obj;
        break;
      }
    }
    if(!this.on_node) {
      for(let i = fc.product_positions.length-1; i >= 0; i--) {
        const obj = fc.product_positions[i].product.setPositionInFocalCluster();
        if(obj.product.containsPoint(this.mouse_x, this.mouse_y)) {
          this.on_node = obj.product;
          break;
        }
      }
    }
    this.on_arrow = null;
    this.on_link = null;
    for(let i = 0; i < fc.arrows.length; i++) {
      const arr = fc.arrows[i];
      if(arr) {
        this.on_arrow = arr;
        // NOTE: arrow may represent multiple links, so find out which one
        const obj = arr.containsPoint(this.mouse_x, this.mouse_y);
        if(obj) {
          this.on_link = obj;
          break;
        }
      }
    }
    this.on_constraint = this.constraintStillUnderCursor();
    if(fc.related_constraints != null) {
      for(let i = 0; i < fc.related_constraints.length; i++) {
        const obj = fc.related_constraints[i];
        if(obj.containsPoint(this.mouse_x, this.mouse_y)) {
          this.on_constraint = obj;
          break;
        }
      }
    }
    this.on_cluster = null;
    this.on_cluster_edge = false;
    for(let i = fc.sub_clusters.length-1; i >= 0; i--) {
      const obj = fc.sub_clusters[i];
      // NOTE: ignore cluster that is being dragged, so that a cluster it is
      // being dragged over will be detected instead
      if(obj != this.dragged_node &&
          obj.containsPoint(this.mouse_x, this.mouse_y)) {
        this.on_cluster = obj;
        this.on_cluster_edge = obj.onEdge(this.mouse_x, this.mouse_y);
        break;
      }
    }
    // unset and redraw target cluster if cursor no longer over it
    if(!this.on_cluster && this.target_cluster) {
      const c = this.target_cluster;
      this.target_cluster = null;
      UI.paper.drawCluster(c);
      // NOTE: element is persistent, so semi-transparency must also be undone
      c.shape.element.setAttribute('opacity', 1);
    }
    this.on_note = null;
    for(let i = fc.notes.length-1; i >= 0; i--) {
      const obj = fc.notes[i];
      if(obj.containsPoint(this.mouse_x, this.mouse_y)) {
        this.on_note = obj;
        break;
      }
    }
    if(this.active_button === this.buttons.link && this.linking_node) {
      // Draw red dotted line from linking node to cursor
      this.paper.dragLineToCursor(this.linking_node, this.mouse_x, this.mouse_y);
    } else if(this.start_sel_x >= 0 && this.start_sel_y >= 0) {
      // Draw selecting rectangle in red dotted lines
      this.paper.dragRectToCursor(this.start_sel_x, this.start_sel_y,
          this.mouse_x, this.mouse_y);
    } else if(this.active_button === this.buttons.constraint &&
        this.constraining_node) {
      // Draw red dotted line from constraining node to cursor
      this.paper.dragLineToCursor(this.constraining_node,
          this.mouse_x, this.mouse_y);
    } else if(this.dragged_node) {
      MODEL.moveSelection(this.mouse_x - this.move_dx - this.dragged_node.x,
        this.mouse_y - this.move_dy - this.dragged_node.y);
    }
    let cr = 'pointer';
    // NOTE: first check ON_CONSTRAINT because constraint thumbnails overlap
    // with nodes
    if(this.on_constraint) {
      DOCUMENTATION_MANAGER.update(this.on_constraint, e.shiftKey);
    // NOTE: skip the "on node" check if the node is being dragged 
    } else if(this.on_node && this.on_node !== this.dragged_node) {
      if((this.active_button === this.buttons.link) && this.linking_node) {
        // Cannot link process to process
        cr = (MODEL.canLink(this.linking_node, this.on_node) ?
            'crosshair' : 'not-allowed');
      } else if(this.active_button === this.buttons.constraint) {
        if(this.constraining_node) {
          cr = (this.constraining_node.canConstrain(this.on_node) ?
              'crosshair' : 'not-allowed');
        } else if(!this.on_node.hasBounds) {
          // Products can only constrain when they have bounds
          cr = 'not-allowed';
        }
      }
      // NOTE: do not overwite status line when cursor is on a block arrow
      if(!this.on_block_arrow) {
        DOCUMENTATION_MANAGER.update(this.on_node, e.shiftKey);
      }
    } else if(this.on_note) {
      // When shift-moving over a note, show the model's documentation
      DOCUMENTATION_MANAGER.update(MODEL, e.shiftKey);
    } else {
      if((this.active_button === this.buttons.link && this.linking_node) ||
          (this.active_button === this.buttons.constraint && this.constraining_node)) {
        // Cannot link to clusters or notes
        cr = (this.on_cluster || this.on_note ? 'not-allowed' : 'crosshair');                      
      } else if(!this.on_note && !this.on_constraint && !this.on_link &&
          !this.on_cluster_edge) {
        cr = 'default';
      }
      if(!this.on_block_arrow) {
        if(this.on_link) {
          DOCUMENTATION_MANAGER.update(this.on_link, e.shiftKey);
        } else if(this.on_cluster) {
          DOCUMENTATION_MANAGER.update(this.on_cluster, e.shiftKey);
        } else if(!this.on_arrow) {
          this.setMessage('');
        }
      }
      // When dragging selection that contains a process, change cursor to
      // indicate that selected process(es) will be moved into the cluster
      if(this.dragged_node && this.on_cluster) {
        cr = 'cell';
        this.target_cluster = this.on_cluster;
        // Redraw the target cluster so it will appear on top (and highlighted)
        UI.paper.drawCluster(this.target_cluster);
      }
    }
    this.paper.container.style.cursor = cr;
  }

  mouseDown(e) {
    // Responds to mousedown event in model diagram area
    // In case mouseup event occurred outside drawing area,ignore this
    // mousedown event, so that only the mouseup will be processed
    if(this.start_sel_x >= 0 && this.start_sel_y >= 0) return;
    const cp = this.paper.cursorPosition(e.pageX, e.pageY);
    this.mouse_down_x = cp[0];
    this.mouse_down_y = cp[1];
    // De-activate "stay active" buttons if dysfunctional, or if SHIFT,
    // ALT or CTRL is pressed
    if((e.shiftKey || e.altKey || e.ctrlKey ||
        this.on_note || this.on_cluster || this.on_link || this.on_constraint ||
        (this.on_node && this.active_button !== this.buttons.link &&
            this.active_button !== this.buttons.constraint)) && this.stayActive) {
      resetActiveButton();
    }
    // NOTE: only left button is detected (browser catches right menu button)
    if(e.ctrlKey) {
      // Remove clicked item from selection
      if(MODEL.selection) {
        // NOTE: first check constraints -- see mouseMove() for motivation
        if(this.on_constraint) {
          if(MODEL.selection.indexOf(this.on_constraint) >= 0) {
            MODEL.deselect(this.on_constraint);
          } else {
            MODEL.select(this.on_constraint);
          }
        } else if(this.on_node){
          if(MODEL.selection.indexOf(this.on_node) >= 0) {
            MODEL.deselect(this.on_node);
          } else {
            MODEL.select(this.on_node);
          }
        } else if(this.on_cluster) {
          if(MODEL.selection.indexOf(this.on_cluster) >= 0) {
            MODEL.deselect(this.on_cluster);
          } else {
            MODEL.select(this.on_cluster);
          }
        } else if(this.on_note) {
          if(MODEL.selection.indexOf(this.on_note) >= 0) {
            MODEL.deselect(this.on_note);
          } else {
            MODEL.select(this.on_note);
          }
        } else if(this.on_link) {
          if(MODEL.selection.indexOf(this.on_link) >= 0) {
            MODEL.deselect(this.on_link);
          } else {
            MODEL.select(this.on_link);
          }
        }
        UI.drawDiagram(MODEL);
      }
      this.updateButtons();
      return;
    } // END IF Ctrl
  
    // Clear selection unless SHIFT pressed or mouseDown while hovering
    // over a SELECTED node or link
    if(!(e.shiftKey ||
        (this.on_node && MODEL.selection.indexOf(this.on_node) >= 0) ||
        (this.on_cluster && MODEL.selection.indexOf(this.on_cluster) >= 0) ||
        (this.on_note && MODEL.selection.indexOf(this.on_note) >= 0) ||
        (this.on_link && MODEL.selection.indexOf(this.on_link) >= 0) ||
        (this.on_constraint && MODEL.selection.indexOf(this.on_constraint) >= 0))) {
      MODEL.clearSelection();
      UI.drawDiagram(MODEL);
    }
  
    // If one of the top six sidebar buttons is active, prompt for new node
    // (not link or constraint)
    if(this.active_button && this.active_button !== this.buttons.link &&
        this.active_button !== this.buttons.constraint) {
      this.add_x = this.mouse_x;
      this.add_y = this.mouse_y;
      const obj = this.active_button.id.split('-')[0];
      if(!this.stayActive) this.resetActiveButton();
      if(obj === 'process') {
        setTimeout(() => {
              const md = UI.modals['add-process'];
              md.element('name').value = '';
              md.element('actor-name').value = '';
              md.show('name');
            });
      } else if(obj === 'product') {
        setTimeout(() => {
              const md = UI.modals['add-product'];
              md.element('name').value = '';
              md.element('unit').value = MODEL.default_unit;
              UI.setBox('add-product-data', false);
              md.show('name');
            });            
      } else if(obj === 'cluster') {
        setTimeout(() => {
              const md = UI.modals.cluster;
              md.element('name').value = '';
              md.element('actor-name').value = '';
              md.show('name');
            });            
      } else if(obj === 'note') {
        setTimeout(() => {
              const md = UI.modals.note;
              md.element('action').innerHTML = 'Add';
              md.element('C').value = '';
              md.element('text').value = '';
              md.show('text');
            });
      }
      return;
    }
  
    // ALT key pressed => open properties dialog if cursor hovers over
    // some element
    if(e.altKey) {
      // NOTE: first check constraints -- see mouseMove() for motivation
      if(this.on_constraint) {
        this.showConstraintPropertiesDialog(this.on_constraint);
      } else if(this.on_node) {
        if(this.on_node instanceof Process) {
          this.showProcessPropertiesDialog(this.on_node);
        } else if(e.shiftKey) {
          // Shift-Alt on product is like Shift-Double-click
          this.showReplaceProductDialog(this.on_node);
        } else { 
          this.showProductPropertiesDialog(this.on_node);
        }
      } else if(this.on_note) {
        this.showNotePropertiesDialog(this.on_note);
      } else if(this.on_cluster) {
        this.showClusterPropertiesDialog(this.on_cluster);
      } else if(this.on_link) {
        this.showLinkPropertiesDialog(this.on_link);
      }
    // NOTE: first check constraints -- see mouseMove() for motivation
    } else if(this.on_constraint) {
      MODEL.select(this.on_constraint);
    } else if(this.on_note) {
      this.dragged_node = this.on_note;
      this.move_dx = this.mouse_x - this.on_note.x;
      this.move_dy = this.mouse_y - this.on_note.y;
      MODEL.select(this.on_note);
      UNDO_STACK.push('move', this.dragged_node, true);
    // Cursor on node => add link or constraint, or start moving
    } else if(this.on_node) {
      if(this.active_button === this.buttons.link) {
        this.linking_node = this.on_node;
        // NOTE: return without updating buttons
        return;
      } else if(this.active_button === this.buttons.constraint) {
        // Allow constraints only on nodes having upper bounds defined
        if(this.on_node.upper_bound.defined) {
          this.constraining_node = this.on_node;
          // NOTE: here, too, return without updating buttons
          return;
        }
      } else {
        this.dragged_node = this.on_node;
        this.move_dx = this.mouse_x - this.on_node.x;
        this.move_dy = this.mouse_y - this.on_node.y;
        if(MODEL.selection.indexOf(this.on_node) < 0) MODEL.select(this.on_node);
        // Pass dragged node for UNDO
        UNDO_STACK.push('move', this.dragged_node, true);
      }
    } else if(this.on_cluster) {
      this.dragged_node = this.on_cluster;
      this.move_dx = this.mouse_x - this.on_cluster.x;
      this.move_dy = this.mouse_y - this.on_cluster.y;
      MODEL.select(this.on_cluster);
      UNDO_STACK.push('move', this.dragged_node, true);
    } else if(this.on_link) {
      MODEL.select(this.on_link);
    } else {
      this.start_sel_x = this.mouse_x;
      this.start_sel_y = this.mouse_y;
    }
    this.updateButtons();
  }

  mouseUp(e) {
    // Responds to mouseup event
    const cp = this.paper.cursorPosition(e.pageX, e.pageY);
    this.mouse_up_x = cp[0];
    this.mouse_up_y = cp[1];
    // First check whether user is selecting a rectangle
    if(this.start_sel_x >= 0 && this.start_sel_y >= 0) {
      // Clear previous selection unless user is adding to it (by still
      // holding SHIFT button down)
      if(!e.shiftKey) MODEL.clearSelection();
      // Compute defining points of rectangle (top left and bottom right)
      const
          tlx = Math.min(this.start_sel_x, this.mouse_up_x),
          tly = Math.min(this.start_sel_y, this.mouse_up_y),
          brx = Math.max(this.start_sel_x, this.mouse_up_x),
          bry = Math.max(this.start_sel_y, this.mouse_up_y);
      // If rectangle has size greater than 2x2 pixels, select all elements
      // having their center inside the selection rectangle
      if(brx - tlx > 2 && bry - tly > 2) {
        const ol = [], fc = MODEL.focal_cluster;
        for(let i = 0; i < fc.processes.length; i++) {
          const obj = fc.processes[i];
          if(obj.x >= tlx && obj.x <= brx && obj.y >= tly && obj.y < bry) {
            ol.push(obj);
          }
        }
        for(let i = 0; i < fc.product_positions.length; i++) {
          const obj = fc.product_positions[i];
          if(obj.x >= tlx && obj.x <= brx && obj.y >= tly && obj.y < bry) {
            ol.push(obj.product);
          }
        }
        for(let i = 0; i < fc.sub_clusters.length; i++) {
          const obj = fc.sub_clusters[i];
          if(obj.x >= tlx && obj.x <= brx && obj.y >= tly && obj.y < bry) {
            ol.push(obj);
          }
        }
        for(let i = 0; i < fc.notes.length; i++) {
          const obj = fc.notes[i];
          if(obj.x >= tlx && obj.x <= brx && obj.y >= tly && obj.y < bry) {
            ol.push(obj);
          }
        }
        for(let i in MODEL.links) if(MODEL.links.hasOwnProperty(i)) {
          const obj = MODEL.links[i];
          // Only add a link if both its nodes are selected as well
          if(fc.linkInList(obj, ol)) {
            ol.push(obj);
          }
        }
        for(let i in MODEL.constraints) if(MODEL.constraints.hasOwnProperty(i)) {
          const obj = MODEL.constraints[i];
          // Only add a constraint if both its nodes are selected as well
          if(fc.linkInList(obj, ol)) {
            ol.push(obj);
          }
        }
        // Having compiled the object list, actually select them
        MODEL.selectList(ol);
        this.paper.drawSelection(MODEL);
      }
      this.start_sel_x = -1;
      this.start_sel_y = -1;
      this.paper.hideDragRect();
  
    // Then check whether user is drawing a flow link
    // (by dragging its endpoint)
    } else if(this.linking_node) {
      // If so, check whether the cursor is over a node of the appropriate type
      if(this.on_node && MODEL.canLink(this.linking_node, this.on_node)) {
        const obj = MODEL.addLink(this.linking_node, this.on_node);
        UNDO_STACK.push('add', obj);
        MODEL.select(obj);
        this.paper.drawModel(MODEL);
      }
      this.linking_node = null;
      if(!this.stayActive) this.resetActiveButton();
      this.paper.hideDragLine();
  
    // Then check whether user is drawing a constraint link
    // (again: by dragging its endpoint)
    } else if(this.constraining_node) {
      if(this.on_node && this.constraining_node.canConstrain(this.on_node)) {
        // display constraint editor
        CONSTRAINT_EDITOR.from_name.innerHTML = this.constraining_node.displayName;
        CONSTRAINT_EDITOR.to_name.innerHTML = this.on_node.displayName;
        CONSTRAINT_EDITOR.showDialog();
      }
      this.linking_node = null;
      this.constraining_node = null;
      if(!this.stayActive) this.resetActiveButton();
      UI.drawDiagram(MODEL);
  
    // Then check whether the user is moving a node (possibly part of a
    // larger selection)
    } else if(this.dragged_node) {
      // Always perform the move operation (this will do nothing if the
      // cursor did not move) 
      MODEL.moveSelection(
          this.mouse_up_x - this.mouse_x, this.mouse_up_y - this.mouse_y);
      // @@TO DO: if on top of a cluster, move it there
      // NOTE: cursor will always be over the selected cluster (while dragging) 
      if(this.on_cluster && !this.on_cluster.selected) {
        UNDO_STACK.push('drop', this.on_cluster);
        MODEL.dropSelectionIntoCluster(this.on_cluster);
        this.on_node = null;
        this.on_note = null;
        this.target_cluster = null;
        // Redraw cluster to erase its "target corona"
        UI.paper.drawCluster(this.on_cluster);
      }
  
      // Check wether the cursor has been moved
      const
          absdx = Math.abs(this.mouse_down_x - this.mouse_x),
          absdy = Math.abs(this.mouse_down_y - this.mouse_y);
      // If no *significant* move made, remove the move undo
      if(absdx + absdy === 0) UNDO_STACK.pop('move');
      if(this.doubleClicked && absdx + absdy < 3) {
        // Double-clicking opens properties dialog, except for clusters;
        // then "drill down", i.e., make the double-clicked cluster focal
        if(this.dragged_node instanceof Cluster) {
          // NOTE: bottom & right cluster edges remain sensitive!
          if(this.on_cluster_edge) {
            this.showClusterPropertiesDialog(this.dragged_node);
          } else {
            this.makeFocalCluster(this.dragged_node);
          }
        } else if(this.dragged_node instanceof Product) {
          if(e.shiftKey) {
            // Shift-double-clicking on a *product* prompts for "remapping"
            // the product position to another product (and potentially
            // deleting the original one if it has no more occurrences)
            this.showReplaceProductDialog(this.dragged_node);
          } else {
            this.showProductPropertiesDialog(this.dragged_node);
          }
        } else if(this.dragged_node instanceof Process) {
          this.showProcessPropertiesDialog(this.dragged_node);
        } else {
          this.showNotePropertiesDialog(this.dragged_node);
        }
      }
      this.dragged_node = null;
  
    // Then check whether the user is clicking on a link
    } else if(this.on_link) {
      if(this.doubleClicked) {
        this.showLinkPropertiesDialog(this.on_link);
      }
    } else if(this.on_constraint) {
      if(this.doubleClicked) {
        this.showConstraintPropertiesDialog(this.on_constraint);
      }
    }
    this.start_sel_x = -1;
    this.start_sel_y = -1;
    this.updateButtons();
  }

  //
  // Handler for keyboard events
  //
  
  checkModals(e) {
    // Respond to Escape, Enter and shortcut keys
    const
        ttype = e.target.type,
        ttag = e.target.tagName,
        modals = document.getElementsByClassName('modal');
    // Modal dialogs: hide on ESC and move to next input on ENTER
    let maxz = 0,
        topmod = null;
    for(let i = 0; i < modals.length; i++) {
      const
          m = modals[i],
          cs = window.getComputedStyle(m),
          z = parseInt(cs.zIndex);
      if(cs.display !== 'none' && z > maxz) {
        topmod = m;
        maxz = z;
      }
    }
    // NOTE: consider only the top modal (if any)
    if(e.keyCode === 27) {
      e.stopImmediatePropagation();
      if(topmod) topmod.style.display = 'none';
    } else if(e.keyCode === 13 && ttype !== 'textarea') {
      e.preventDefault();
      if(topmod) {
        const inp = Array.from(topmod.getElementsByTagName('input'));
        let i = inp.indexOf(e.target) + 1;
        while(i < inp.length && inp[i].disabled) i++;
        if(i < inp.length) {
          inp[i].focus();
        } else if('constraint-modal xp-clusters-modal'.indexOf(topmod.id) >= 0) {
          // NOTE: constraint modal and "ignore clusters" modal must NOT close
          // when Enter is pressed; just de-focus the input field
          e.target.blur();
        } else {
          const btns = topmod.getElementsByClassName('ok-btn');
          if(btns.length > 0) btns[0].dispatchEvent(new Event('click'));
        }
      }
    } else if(e.keyCode === 8 &&
        ttype !== 'text' && ttype !== 'password' && ttype !== 'textarea') {
      // Prevent backspace to be interpreted (by FireFox) as "go back in browser"
      e.preventDefault();
    } else if(ttag === 'BODY') {
      // Constraint Editor accepts arrow keys
      if(topmod && topmod.id === 'constraint-modal') {
        if([37, 38, 39, 40].indexOf(e.keyCode) >= 0) {
          e.preventDefault();
          CONSTRAINT_EDITOR.arrowKey(e.keyCode);
          return;
        }
      }
      // end. home, Left and right arrow keys
      if([35, 36, 37, 39].indexOf(e.keyCode) >= 0) e.preventDefault();
      if(e.keyCode === 35) {
        MODEL.t = MODEL.end_period - MODEL.start_period + 1;
        UI.updateTimeStep();
        UI.drawDiagram(MODEL);
      } else if(e.keyCode === 36) {
        MODEL.t = 1;
        UI.updateTimeStep();
        UI.drawDiagram(MODEL);
      } else if(e.keyCode === 37) {
        this.stepBack(e);
      } else if(e.keyCode === 39) {
        this.stepForward(e);
      } else if(!e.shiftKey && !e.altKey &&
          (!topmod || [65, 67, 86].indexOf(e.keyCode) < 0)) {
        // Interpret special keys as shortcuts unless a modal dialog is open
        if(e.keyCode === 46) {
          // DEL button => delete selection
          e.preventDefault();
          if(!this.hidden('constraint-modal')) {
            CONSTRAINT_EDITOR.deleteBoundLine();
          } else if(!this.hidden('variable-modal')) {
            CHART_MANAGER.deleteVariable();
          } else {
            this.buttons['delete'].dispatchEvent(new Event('click'));
          }
        } else if (e.keyCode === 190 && (e.ctrlKey || e.metaKey)) {
          // Ctrl-. (dot) moves entire diagram to upper-left corner
          e.preventDefault();
          this.paper.fitToSize();
          MODEL.alignToGrid();
        } else if (e.keyCode >= 65 && e.keyCode <= 90 && (e.ctrlKey || e.metaKey)) {
          // ALWAYS prevent browser to do respond to Ctrl-letter commands
          // NOTE: this cannot prevent a new tab from opening on Ctrl-T 
          e.preventDefault();
          let shortcut = String.fromCharCode(e.keyCode);
          if(shortcut === 'Z' && e.shiftKey) {
            // Interpret Shift-Ctrl-Z as Ctrl-Y (redo last undone operation)
            shortcut = 'Y';
          }
          if(this.shortcuts.hasOwnProperty(shortcut)) {
            const btn = this.buttons[this.shortcuts[shortcut]];
            if(!this.hidden(btn.id) && !btn.classList.contains('disab')) {
              btn.dispatchEvent(new Event('click'));
            }
          }
        }
      }
    }
  }

  //
  // Handlers for checkbox events
  //

  toggleBox(event) {
    const el = event.target;
    if(!el.classList.contains('disab')) {
      if(el.classList.contains('clear')) {
        el.classList.remove('clear');
        el.classList.add('checked');
      } else {
        el.classList.remove('checked');
        el.classList.add('clear');
      }
    }
  }
  
  setBox(id, checked) {
    const box = document.getElementById(id);
    if(checked) {
      box.classList.remove('clear');
      box.classList.add('checked');
    } else {
      box.classList.remove('checked');
      box.classList.add('clear');
    }
  }
  
  boxChecked(id) {
    return document.getElementById(id).classList.contains('checked');
  }

  //
  // Handlers for "equal bounds" togglebox events
  //

  setEqualBounds(type, status) {
     // Set "equal bounds" button (`status` = TRUE or FALSE).
     // `type` should be 'process' or 'product'
    const btn = document.getElementById(type + '-UB-equal');
    if(status) {
      btn.classList.remove('nebtn');
      btn.classList.add('eqbtn');
    } else {
      btn.classList.remove('eqbtn');
      btn.classList.add('nebtn');
    }
    this.updateEqualBounds(type);
  }
  
  updateEqualBounds(type) {
    // Enable/disable UB input fields, depending on button status
    // NOTE: `type` should be 'process' or 'product'
    const
        prefix = type + '-UB',
        inp = document.getElementById(prefix),
        eql = document.getElementById(prefix + '-equal'),
        edx = document.getElementById(prefix + '-x'),
        lbl = document.getElementById(prefix + '-lbl');
    if(eql.classList.contains('nebtn')) {
      inp.disabled = false;
      edx.classList.remove('disab');
      edx.classList.add('enab');
      lbl.style.color = 'black';
      lbl.style.textShadow = 'none';
    } else {
      inp.disabled = true;
      edx.classList.remove('enab');
      edx.classList.add('disab');
      lbl.style.color = 'gray';
      lbl.style.textShadow = '1px 1px white';
    }
  }
  
  toggleEqualBounds(event) {
    // Alternate "equal bounds" button status
    // NOTE: `type` should be 'process' or 'product'
    const
        btn = event.target,
        type = btn.id.split('-')[0];
    this.setEqualBounds(type, btn.classList.contains('nebtn'));
  }
  
  getEqualBounds(id) {
    return document.getElementById(id).classList.contains('eqbtn');
  }
  
  //
  // Handlers for integer level events
  //

  toggleIntegerLevel(event) {
    const el = event.target;
    if(el.classList.contains('intbtn')) {
      el.classList.remove('intbtn');
      el.classList.add('contbtn');
    } else {
      el.classList.remove('contbtn');
      el.classList.add('intbtn');
    }
  }
  
  setIntegerLevel(id, set) {
    const box = document.getElementById(id);
    if(set) {
      box.classList.remove('contbtn');
      box.classList.add('intbtn');
    } else {
      box.classList.remove('intbtn');
      box.classList.add('contbtn');
    }
  }
  
  hasIntegerLevel(id) {
    return document.getElementById(id).classList.contains('intbtn');
  }

  //
  // Handlers for import/export togglebox events
  // 

  toggleImportExportBox(id) {
    const
        io = document.getElementById(id + '-io'),
        bi = document.getElementById(id + '-import'),
        be = document.getElementById(id + '-export');
    if(window.getComputedStyle(bi).display !== 'none') {
      bi.style.display = 'none';
      be.style.display = 'block';
      io.style.color = '#0000b0';
    } else if(window.getComputedStyle(be).display !== 'none') {
      be.style.display = 'none';
      io.style.color = 'silver';
    } else {
      bi.style.display = 'block';
      io.style.color = '#b00000';
    }  
  }
  
  getImportExportBox(id) {
    if(window.getComputedStyle(
        document.getElementById(id + '-import')).display !== 'none') return 1;
    if(window.getComputedStyle(
        document.getElementById(id + '-export')).display !== 'none') return 2;
    return 0;  
  }
  
  setImportExportBox(id, s) {
    const
        io = document.getElementById(id + '-io'),
        bi = document.getElementById(id + '-import'),
        be = document.getElementById(id + '-export');
    bi.style.display = 'none';
    be.style.display = 'none';
    if(s === 1) {
      bi.style.display = 'block';
      io.style.color = '#b00000';
    } else if(s === 2) {
      be.style.display = 'block';
      io.style.color = '#0000b0';
    } else {
      io.style.color = 'silver';
    }  
  }

  //
  // Input field validation
  // 

  validNames(nn, an='') {
    // Check whether names meet conventions; if not, warn user
    if(!UI.validName(nn) || nn.indexOf(UI.BLACK_BOX) >= 0) {
      UI.warn(`Invalid name "${nn}"`);
      return false;
    }
    if(an === '' || an === UI.NO_ACTOR) return true;
    if(!UI.validName(an)) {
      UI.warn(`Invalid actor name "${an}"`);
      return false;
    }
    return true;
  }
  
  validNumericInput(id, name) {
    // Returns number if input field with identifier `id` contains a number;
    // otherwise returns FALSE; if error, focuses on the field and shows
    // the error while specifying the name of the field
    // NOTE: accept both . and , as decimal point
    const
        inp = document.getElementById(id),
        txt = inp.value.trim().replace(',', '.');
    // NOTE: for some fields, empty strings denote default values, typically 0
    if(txt === '') {
      if(['initial level', 'delay', 'share of cost', 'Delta'].indexOf(name) >= 0) {
        return 0;
      }
    }
    const n = parseFloat(txt);
    // NOTE: any valid number ends with a digit (e.g., 100, 100.0, 1E+2),
    // but parseFloat is more tolerant; however, Linny-R should not accept
    // input such as "100x" nor even "100." 
    if(isNaN(n) || '0123456789'.indexOf(txt[txt.length - 1]) < 0) {
      this.warn(`Invalid number "${txt}" for ${name}`);
      inp.focus();
      return false;
    }
    return n;
  }

  updateExpressionInput(id, name, x) {
    // Updates expression object `x` if input field identified by `id`
    // contains a well-formed expression; if error, focuses on the field
    // and shows the error while specifying the name of the field.
    const
        inp = document.getElementById(id),
        xp = new ExpressionParser(inp.value.trim(), x.object, x.attribute);
    if(xp.error) {
      inp.focus();
      this.warn(`Invalid expression for ${name}: ${xp.error}`);
      return false;
    } else if(xp.is_level_based && name !== 'note color') {
      this.warn(`Expression for ${name} contains a solution-dependent variable`);
    }
    x.update(xp);
    // NOTE: overrule `is_static` to make that IL is always evaluated for t=1
    if(name === 'initial level') x.is_static = true; 
    return true;
  }

  //
  // Navigation in the cluster hierarchy
  //
  
  showParentCluster() {
    if(MODEL.focal_cluster.cluster) {
      this.makeFocalCluster(MODEL.focal_cluster.cluster);
      this.updateButtons();
    }
  }
  
  moveSelectionToParentCluster() {
    if(MODEL.focal_cluster.cluster) {
      UNDO_STACK.push('lift', MODEL.focal_cluster.cluster);
      MODEL.focal_cluster.clearAllProcesses();
      MODEL.dropSelectionIntoCluster(MODEL.focal_cluster.cluster);
      this.updateButtons();
    }
  }

  //
  // Moving backwards and forwards in time
  //
  
  stepBack(e) {
    if(e.target.classList.contains('disab')) return;
    if(MODEL.simulationTimeStep > MODEL.start_period) {
      const dt = (e.shiftKey ? 10 : 1) * (e.ctrlKey || e.metaKey ? 100 : 1);
      MODEL.t = Math.max(1, MODEL.t - dt);
      UI.updateTimeStep();
      UI.drawDiagram(MODEL);
    }
  }
  
  stepForward(e) {
    if(e.target.classList.contains('disab')) return;
    if(MODEL.simulationTimeStep < MODEL.end_period) {
      const dt = (e.shiftKey ? 10 : 1) * (e.ctrlKey || e.metaKey ? 100 : 1);
      MODEL.t = Math.min(MODEL.end_period - MODEL.start_period + 1, MODEL.t + dt);
      UI.updateTimeStep();
      UI.drawDiagram(MODEL);
    }
  }
  
  //
  // Special features that may not work in all browsers
  //
  
  copyStringToClipboard(string) {
    // Copies string to clipboard and notifies user of #lines copied
    let msg = pluralS(string.split('\n').length, 'line') +
            ' copied to clipboard',
        type = 'notification';
    if(navigator.clipboard) {
      navigator.clipboard.writeText(string).catch(
          () => UI.setMessage('Failed to copy to clipboard', 'warning'));
    } else {
      // Workaround using deprecated execCommand
      const ta = document.createElement('textarea');
      document.body.appendChild(ta);
      ta.value = string;
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    UI.setMessage(msg, type);
  }
  
  copyHtmlToClipboard(html) {
    // Copy HTML to clipboard
    function listener(event) {
      event.clipboardData.setData('text/html', html);
      event.preventDefault();
    }
    document.addEventListener('copy', listener);
    document.execCommand('copy');
    document.removeEventListener('copy', listener);
  }
  
  logHeapSize(msg='') {
    // Logs MB's of used heap memory to console (to detect memory leaks)
    // NOTE: this feature is supported only by Chrome
    if(msg) msg += ' -- ';
    if(typeof performance.memory !== 'undefined') {
      console.log(msg + 'Allocated memory: ' + Math.round(
          performance.memory.usedJSHeapSize/1048576.0).toFixed(1) + ' MB');
    }
  }

  //
  // Informing the modeler via the status line
  //
    
  setMessage(msg, type=null) {
    // Displays message on infoline unless no type (= plain text) and some
    // info, warning or error message is already displayed
    super.setMessage(msg, type);
    let d = new Date(),
        t = d.getTime(),
        dt = t - this.time_last_message;
    if(type) {
      // Update global variable (and force display) only for "real" messages
      this.time_last_message = t;
      dt = this.message_display_time;
      SOUNDS[type].play().catch(() => {
          console.log('NOTICE: Sounds will only play after first user action');
        });
      const
          now = [d.getHours(), d.getMinutes().toString().padStart(2, '0'),
              d.getSeconds().toString().padStart(2, '0')].join(':'),
          im = {time: now, text: msg, status: type};
      DOCUMENTATION_MANAGER.addMessage(im);
      // When receiver is active, add message to its log
      if(RECEIVER.active) RECEIVER.log(`[${now}] ${msg}`);
    }
    // Display text only if previous message has "timed out" or was plain text
    if(dt >= this.message_display_time) {
      const il = document.getElementById('info-line');
      il.classList.remove('error', 'warning', 'notification');
      il.classList.add(type);
      il.innerHTML = msg;
    }
  }
  
  // Visual feedback for time-consuming actions
  waitingCursor() {
    document.body.className = 'waiting';
  }

  normalCursor() {
    document.body.className = '';
  }

  setProgressNeedle(fraction) {
    // Shows a thin purple line just above the status line to indicate progress
    const el = document.getElementById('set-up-progress-bar');
    el.style.width = Math.round(Math.max(0, Math.min(1, fraction)) * 100) + '%';
  }
  
  hideStayOnTopDialogs() {
    // Hide and reset all stay-on-top dialogs (even when not showing)
    // NOTE: this routine is called when a new model is loaded
    DATASET_MANAGER.dialog.style.display = 'none';
    this.buttons.dataset.classList.remove('stay-activ');
    DATASET_MANAGER.reset();
    EQUATION_MANAGER.dialog.style.display = 'none';
    this.buttons.equation.classList.remove('stay-activ');
    EQUATION_MANAGER.reset();
    CHART_MANAGER.dialog.style.display = 'none';
    this.buttons.chart.classList.remove('stay-activ');
    CHART_MANAGER.reset();
    REPOSITORY_BROWSER.dialog.style.display = 'none';
    this.buttons.repository.classList.remove('stay-activ');
    REPOSITORY_BROWSER.reset();
    SENSITIVITY_ANALYSIS.dialog.style.display = 'none';
    this.buttons.sensitivity.classList.remove('stay-activ');
    SENSITIVITY_ANALYSIS.reset();
    EXPERIMENT_MANAGER.dialog.style.display = 'none';
    this.buttons.experiment.classList.remove('stay-activ');
    EXPERIMENT_MANAGER.reset();
    DOCUMENTATION_MANAGER.dialog.style.display = 'none';
    this.buttons.documentation.classList.remove('stay-activ');
    DOCUMENTATION_MANAGER.reset();
    FINDER.dialog.style.display = 'none';
    this.buttons.finder.classList.remove('stay-activ');
    FINDER.reset();
    MONITOR.dialog.style.display = 'none';
    this.buttons.monitor.classList.remove('stay-activ');
    MONITOR.reset();
    // No more visible dialogs, so clear their z-index ordering array
    this.dr_dialog_order.length = 0;
  }

  //
  // Operations that affect the current Linny-R model
  //
  
  promptForNewModel() {
    // Prompt for model name and author name
    // @@TO DO: warn user if unsaved changes to current model
    this.hideStayOnTopDialogs();
    // Clear name, but not author field, as it is likely the same modeler
    this.modals.model.element('name').value = '';
    this.modals.model.show('name');
  }

  createNewModel() {
    const md = this.modals.model;
    // Create a brand new model with (optionally) specified name and author
    MODEL = new LinnyRModel(
        md.element('name').value.trim(), md.element('author').value.trim());
    md.hide();
    this.updateTimeStep(MODEL.simulationTimeStep);
    this.drawDiagram(MODEL);
    UNDO_STACK.clear();
    VM.reset();
    this.updateButtons();
    AUTO_SAVE.setAutoSaveInterval();
  }
  
  addNode(type) {
    let n = null,
        nn,
        an,
        md;
    if(type === 'note') {
      md = this.modals.note;
      const cx = new Expression(null, '', '');
      if(this.updateExpressionInput('note-C', 'note color', cx)) {
        if(md.element('action').innerHTML === 'Edit') {
          n = this.dbl_clicked_node;
          this.dbl_clicked_node = null;
          UNDO_STACK.push('modify', n);
          n.contents = md.element('text').value;
          n.color.text = md.element('C').value;
          n.color.compile();
          n.parsed = false;
          n.resize();
        } else {
          n = MODEL.addNote();
          n.x = this.add_x;
          n.y = this.add_y;
          n.contents = md.element('text').value;
          n.color.text = md.element('C').value;
          n.color.compile();
          n.parsed = false;
          n.resize();
          UNDO_STACK.push('add', n);
        }
      }
    } else if(type === 'cluster') {
      md = this.modals.cluster;
      nn = md.element('name').value;
      an = md.element('actor-name').value;
      if(!this.validNames(nn, an)) {
        UNDO_STACK.pop();
        return;
      }
      if(this.dbl_clicked_node) {
        n = this.dbl_clicked_node;
        // NOTE: `rename` returns TRUE when node could be renamed; if not, it
        // returns the node having the new name (and hence blocking the rename)
        n = n.rename(nn, an);
        if(n !== true) this.warningEntityExists(n);
        n = this.dbl_clicked_node;
        n.collapsed = this.boxChecked('cluster-collapsed');
        n.ignore = this.boxChecked('cluster-ignore');
        n.black_box = this.boxChecked('cluster-black-box');
        this.dbl_clicked_node = null;
        // Restore default dialog title, and hide the "collapse" option
        md.element('action').innerHTML = 'Add';
        md.element('options').style.display = 'none';
      } else {
        n = MODEL.addCluster(nn, an);
        if(n) {
          // If X and Y are set, cluster exists => ask whether to move it
          if(n.x !== 0 || n.y !== 0) {
            if(n.cluster !== MODEL.focal_cluster) {
              this.confirmToMoveNode(n);
            } else {
              this.warningEntityExists(n);
            }
          } else {
            n.x = this.add_x;
            n.y = this.add_y;
            UNDO_STACK.push('add', n);
          }
        }
      }
    } else if(type === 'process' || type === 'product') {
      if(this.dbl_clicked_node) {
        n = this.dbl_clicked_node;
        md = this.modals['add-' + type];
        this.dbl_clicked_node = null;
      } else {
        if(type === 'process') {
          md = this.modals['add-process'];
          nn = md.element('name').value;
          an = md.element('actor-name').value;
          if(!this.validNames(nn, an)) {
            UNDO_STACK.pop();
            return false;
          }
          n = MODEL.addProcess(nn, an);
        } else {
          md = this.modals['add-product'];
          nn = md.element('name').value;
          if(!this.validNames(nn)) {
            UNDO_STACK.pop();
            return false;
          }
          // NOTE: pre-check if product exists
          const pp = MODEL.objectByName(nn);
          n = MODEL.addProduct(nn);
          if(n) {
            if(pp) {
              // Do not change unit or data type of existing product
              this.notify(`Added existing product <em>${pp.displayName}</em>`);
            } else {
              n.scale_unit = MODEL.addScaleUnit(md.element('unit').value);
              n.is_data = this.boxChecked('add-product-data');
            }
            MODEL.focal_cluster.addProductPosition(n, this.add_x, this.add_y);
          }
        }
        if(n) {
          // If process, and X and Y are set, it exists; then if not in the
          // focal cluster, ask whether to move it there
          if(n instanceof Process && (n.x !== 0 || n.y !== 0)) {
            if(n.cluster !== MODEL.focal_cluster) {
              this.confirmToMoveNode(n);
            } else {
              this.warningEntityExists(n);
            }
          } else {
            n.x = this.add_x;
            n.y = this.add_y;
            UNDO_STACK.push('add', n);
          }
        }
      }
    }
    MODEL.inferIgnoredEntities();
    if(n) {
      md.hide();
      // Select the newly added entity
      // NOTE: If the focal cluster was selected (via the top tool bar), it
      // cannot be selected
      if(n !== MODEL.focal_cluster) this.selectNode(n);
    }
  }
  
  selectNode(n) {
    // Make `n` the current selection, and redraw so that it appears in red
    if(n) {
      MODEL.select(n);
      UI.drawDiagram(MODEL);
      // Generate a mousemove event for the drawing canvas to update the cursor etc.
      this.cc.dispatchEvent(new Event('mousemove'));
      this.updateButtons();
    }
  }
  
  confirmToMoveNode(n) {
    // Store node `n` in global variable, and open confirm dialog
    const md = this.modals.move;
    this.node_to_move = n;
    md.element('node-type').innerHTML = n.type.toLowerCase();
    md.element('node-name').innerHTML = n.displayName;
    md.element('from-cluster').innerHTML = n.cluster.displayName;
    md.show();  
  }
  
  doNotMoveNode() {
    // Cancel the "move node to focal cluster" operation
    this.node_to_move = null;
    this.modals.move.hide(); 
  }
  
  moveNodeToFocalCluster() {
    // Perform the "move node to focal cluster" operation
    const n = this.node_to_move;
    this.node_to_move = null;
    this.modals.move.hide();
    if(n instanceof Process || n instanceof Cluster) {
      // Keep track of the old parent cluster
      const pc = n.cluster;
      // TO DO: prepare for undo
      n.setCluster(MODEL.focal_cluster);
      n.x = this.add_x;
      n.y = this.add_y;
      // Prepare both affected parent clusters for redraw
      pc.clearAllProcesses();
      MODEL.focal_cluster.clearAllProcesses();
      this.selectNode(n);
    }
  }
  
  promptForCloning() {
    // Opens CLONE modal
    const n = MODEL.selection.length;
    if(n > 0) {
      const md = UI.modals.clone;
      md.element('prefix').value = '';
      md.element('actor').value = '';
      md.element('count').innerHTML = `(${pluralS(n, 'element')})`;
      md.show('prefix');
    }
  }
  
  cloneSelection() {
    const md = UI.modals.clone;
    if(MODEL.selection.length) {
      const
          p_prompt = md.element('prefix'),
          a_prompt = md.element('actor'),
          renumber = this.boxChecked('clone-renumbering'),
          actor_name = a_prompt.value.trim();
      let prefix = p_prompt.value.trim();
      // Perform basic validation of combination prefix + actor
      let msg = '';
      p_prompt.focus();
      if(!prefix && !actor_name && !(renumber && MODEL.canRenumberSelection)) {
        msg = 'Prefix and actor name cannot both be empty';
      } else if(prefix && !UI.validName(prefix)) {
        msg = `Invalid prefix "${prefix}"`;
      } else if(actor_name && !UI.validName(actor_name)) {
        msg = `Invalid actor name "${actor_name}"`;
        a_prompt.focus();
      }
      if(msg) {
        this.warn(msg);
        return;
      }
      const err = MODEL.cloneSelection(prefix, actor_name, renumber);
      if(err) {
        // Something went wrong, so do not hide the modal, but focus on the
        // DOM element returned by the model's cloning method
        const el = md.element(err);
        if(el) {
          el.focus();
        } else {
          UI.warn(`Unexpected clone result "${err}"`);
        }
        return;
      }
    }
    md.hide();
    this.updateButtons();
  }
  
  cancelCloneSelection() {
    this.modals.clone.hide();
    this.updateButtons();
  }  
  
  //
  // Interaction with modal dialogs to modify model or entity properties
  //
  
  // Settings modal

  showSettingsDialog(model) {
    const md = this.modals.settings;
    md.element('name').value = model.name;
    md.element('author').value = model.author;
    md.element('product-unit').value = model.default_unit;
    md.element('currency-unit').value = model.currency_unit;
    md.element('grid-pixels').value = model.grid_pixels;
    md.element('time-scale').value = model.time_scale;
    md.element('time-unit').value = model.time_unit;
    md.element('period-start').value = model.start_period;
    md.element('period-end').value = model.end_period;
    md.element('block-length').value = model.block_length;
    md.element('look-ahead').value = model.look_ahead;
    md.element('time-limit').value = model.timeout_period;
    this.setBox('settings-encrypt', model.encrypt);
    this.setBox('settings-decimal-comma', model.decimal_comma);
    this.setBox('settings-align-to-grid', model.align_to_grid);
    this.setBox('settings-cost-prices', model.infer_cost_prices);
    this.setBox('settings-block-arrows', model.show_block_arrows);
    md.show('name');
  }
  
  updateSettings(model) {
    // Valdidate inputs
    const px = this.validNumericInput('settings-grid-pixels', 'grid resolution');
    if(px === false) return false;
    const ts = this.validNumericInput('settings-time-scale', 'time step');
    if(ts === false) return false;
    let ps = this.validNumericInput('settings-period-start', 'first time step');
    if(ps === false) return false;
    const md = UI.modals.settings;
    if(ps < 1) {
      this.warn('Simulation cannot start earlier than at t=1');
      md.element('period-start').focus();
      return false;
    }
    let pe = this.validNumericInput('settings-period-end', 'last time step');
    if(pe === false) return false;
    if(pe < ps) {
      this.warn('End time cannot precede start time');
      md.element('period-end').focus();
      return false;      
    }
    const bl = this.validNumericInput('settings-block-length', 'block length');
    if(bl === false) return false;
    const la = this.validNumericInput('settings-look-ahead', 'look-ahead');
    if(la === false) return false;
    if(la < 0) {
      this.warn('Look-ahead must be non-negative');
      md.element('look-ahead').focus();
      return false;
    }
    const tl = UI.validNumericInput('settings-time-limit', 'solver time limit');
    if(tl === false) return false;
    if(tl < 0) {
      // NOTE: time limit 0 is interpreted as "no limit"
      this.warn('Impractical solver time limit');
      md.element('time-limit').focus();
      return false;
    }
    model.name = md.element('name').value.trim();
    model.author = md.element('author').value.trim();
    model.default_unit = md.element('product-unit').value.trim();
    model.currency_unit = md.element('currency-unit').value.trim();
    model.encrypt = UI.boxChecked('settings-encrypt');
    model.decimal_comma = UI.boxChecked('settings-decimal-comma');
    // Some changes may necessitate redrawing the diagram
    let cb = UI.boxChecked('settings-align-to-grid'),
        redraw = !model.align_to_grid && cb;
    model.align_to_grid = cb;
    model.grid_pixels = Math.floor(px);
    cb = UI.boxChecked('settings-cost-prices');
    redraw = redraw || cb !== model.infer_cost_prices;
    model.infer_cost_prices = cb;
    cb = UI.boxChecked('settings-block-arrows');
    redraw = redraw || cb !== model.show_block_arrows;
    model.show_block_arrows = cb;
    // Changes affecting run length (hence vector lengths) require a model reset
    let reset = false;
    reset = reset || (ts != model.time_scale);
    model.time_scale = ts;
    const tu = md.element('time-unit').value;
    reset = reset || (tu != model.time_unit);
    model.time_unit = (tu || CONFIGURATION.default_time_unit);
    ps = Math.floor(ps);
    reset = reset || (ps != model.start_period);
    model.start_period = ps;
    pe = Math.floor(pe);
    reset = reset || (pe != model.end_period);
    model.end_period = pe;
    reset = reset || (bl != model.block_length);
    model.block_length = Math.floor(bl);
    reset = reset || (la != model.look_ahead);
    model.look_ahead = Math.floor(la);
    // Solver settings do not affect vector length
    model.timeout_period = tl;
    // Update currencies in other dialogs
    this.modals.product.element('currency').innerHTML = model.currency_unit;
    // Close the dialog
    md.hide();
    // Ensure that model documentation can no longer be edited
    DOCUMENTATION_MANAGER.clearEntity([model]);
    // Reset model if needed
    if(reset) {
      model.resetExpressions();
      this.notify('To update datasets and results, run the simulation (again)');
      CHART_MANAGER.updateDialog();
      redraw = true;
    }
    // Adjust current time step if it falls outside (new) interval
    if(model.t < ps || model.t > pe) {
      model.t = (model.t < ps ? ps : pe);
      UI.updateTimeStep();
      redraw = true;
    }
    if(redraw) this.drawDiagram(model);
  }
  
  // Note modal

  showNotePropertiesDialog(n=null) {
    this.dbl_clicked_node = n;
    const md = this.modals.note;
    if(n) {
      md.element('action').innerHTML = 'Edit';
      md.element('text').value = n.contents;
      md.element('C').value = n.color.text;
    } else {
      md.element('action').innerHTML = 'Add';
    }
    md.show('text');
  }
  
  // Process modal

  showProcessPropertiesDialog(p, attr='name', alt=false) {
    // Opens the process modal and sets its fields to properties of `p`
    const md = this.modals.process;
    md.element('name').value = p.name;
    // Focus on the name input unless `attr` is specified
    md.show(attr);
    if(p.hasActor) {
      md.element('actor').value = p.actor.name;
    } else {
      md.element('actor').value = '';
    }
    md.element('LB').value = p.lower_bound.text;
    md.element('UB').value = p.upper_bound.text;
    this.setEqualBounds('process', p.equal_bounds);
    this.setBox('process-integer', p.integer_level);
    this.setBox('process-shut-down', p.level_to_zero);
    this.setBox('process-collapsed', p.collapsed);
    md.element('pace').value = p.pace_expression.text;
    md.element('IL').value = p.initial_level.text;
    this.edited_object = p;
    // NOTE: special shortcut Alt-click on an expression property in the Finder
    // dialog means that this experssion should be opened in the Expression
    // Editor; this is effectuated via a "click" event on the edit button next
    // to the attribute input field
    if(alt) md.element(attr + '-x').dispatchEvent(new Event('click'));
  }

  updateProcessProperties() {
    // Validates process properties, and only updates the edited process
    // if all input is OK
    // @@TO DO: prepare for undo
    const
        md = this.modals.process,
        p = this.edited_object;
    // Rename object if name and/or actor have changed
    let pn = md.element('name').value.trim(),
        an = md.element('actor').value.trim(),
        n = p.rename(pn, an);
    // NOTE: When rename returns FALSE, a warning is already shown.
    if(n !== true && n !== false) {
      this.warningEntityExists(n);
      return false;
    }
    // Update expression properties.
    if(!this.updateExpressionInput(
        'process-LB', 'lower bound', p.lower_bound)) return false;
    if(!this.updateExpressionInput(
        'process-UB', 'upper bound', p.upper_bound)) return false;
    // If process is constrained, its upper bound must be defined
    if(!p.upper_bound.defined) {
      const c = MODEL.isConstrained(p);
      if(c) {
        n = (c.from_node === p ? c.to_node : c.from_node);
        this.warningSetUpperBound(n);
        return false;
      }
    }
    if(!this.updateExpressionInput(
        'process-IL', 'initial level', p.initial_level)) return false;
    // Store original expression string
    const pxt = p.pace_expression.text;
    // Validate expression
    if(!this.updateExpressionInput('process-pace', 'level change frequency',
        p.pace_expression)) return false;
    // NOTE: pace expression must be *static* and >= 1
    n = p.pace_expression.result(1);
    if(!p.pace_expression.isStatic || n < 1) {
      md.element('pace').focus();
      this.warn('Level change frequency must be static and &ge; 1');
      // Restore original expression string
      p.pace_expression.text = pxt;
      return false;
    }
    // Ignore fraction if a real number was entered.
    p.pace = Math.floor(n);
    if(n - p.pace > VM.SIG_DIF_LIMIT) this.notify(
        'Level change frequency set to ' + p.pace);
    // Update other properties.
    p.equal_bounds = this.getEqualBounds('process-UB-equal');
    p.integer_level = this.boxChecked('process-integer');
    p.level_to_zero = this.boxChecked('process-shut-down');
    p.collapsed = this.boxChecked('process-collapsed');
    // Redraw the shape, as its appearance and/or link types may have changed
    p.drawWithLinks();
    md.hide();  
    return true;
  }

  // Product modal

  showProductPropertiesDialog(p, attr='name', alt=false) {
    const md = this.modals.product;
    md.element('name').value = p.name;
    md.element('unit').value = p.scale_unit;
    md.element('LB').value = p.lower_bound.text;
    md.element('UB').value = p.upper_bound.text;
    md.show(attr);
    this.setEqualBounds('product', p.equal_bounds);
    this.setBox('product-source', p.is_source);
    this.setBox('product-sink', p.is_sink);
    this.setBox('product-data', p.is_data);
    this.setBox('product-stock', p.is_buffer);
    md.element('P').value = p.price.text;
    md.element('P-unit').innerHTML =
        (p.scale_unit === '1' ? '' : p.scale_unit);
    md.element('currency').innerHTML = MODEL.currency_unit;
    md.element('IL').value = p.initial_level.text;
    this.setBox('product-integer', p.integer_level);
    this.setBox('product-no-slack', p.no_slack);
    this.setBox('product-no-links', p.no_links);
    this.setImportExportBox('product', MODEL.ioType(p));
    this.edited_object = p;
    this.toggleProductStock();
    // NOTE: special shortcut Alt-click on an expression property in the Finder
    // dialog means that this expression should be opened in the Expression
    // Editor; this is effectuated via a "click" event on the edit button next
    // to the attribute input field
    if(alt) md.element(attr + '-x').dispatchEvent(new Event('click'));
  }

  toggleProductStock() {
    // Enables/disables initial level input in the Product modal, depending on
    // the Stock check box status
    const
        lb = document.getElementById('product-LB'),
        il = document.getElementById('product-IL'),
        lbl = document.getElementById('product-IL-lbl'),
        edx = document.getElementById('product-IL-x');
    if(this.boxChecked('product-stock')) {
      // Set lower bound to 0 unless already specified
      if(lb.value.trim().length === 0) lb.value = 0;
      il.disabled = false;
      lbl.style.color = 'black';
      lbl.style.textShadow = 'none';
      edx.classList.remove('disab');
      edx.classList.add('enab');
    } else {
      il.value = 0;
      il.disabled = true;
      lbl.style.color = 'gray';
      lbl.style.textShadow = '1px 1px white';
      edx.classList.remove('enab');
      edx.classList.add('disab');
    }
  }
  
  updateProductProperties() {
    // Validates product properties, and updates only if all input is OK
    const
        md = this.modals.product,
        p = this.edited_object;
    // @@TO DO: prepare for undo
    // Rename object if name has changed
    const nn = md.element('name').value.trim();
    let n = p.rename(nn, '');
    if(n !== true && n !== p) {
      this.warningEntityExists(n);
      return false;
    }
    // Update expression properties
    // NOTE: for stocks, set lower bound to zero if undefined
    const
        stock = this.boxChecked('product-stock'),
        l = md.element('LB');
    if(stock && l.value.trim().length === 0) {
      l.value = '0';
    }
    if(!this.updateExpressionInput('product-LB', 'lower bound',
        p.lower_bound)) return false;
    if(!this.updateExpressionInput('product-UB', 'upper bound',
        p.upper_bound)) return false;
    if(!this.updateExpressionInput('product-IL', 'initial level',
        p.initial_level)) return false;
    if(!this.updateExpressionInput('product-P', 'market price',
        p.price)) return false;
    // If product is constrained, its upper bound must be defined
    if(!p.upper_bound.defined) {
      const c = MODEL.isConstrained(p);
      if(c) {
        n = (c.from_node === this.edited_object ? c.to_node : c.from_node);
        this.warningSetUpperBound(n);
        return false;
      }
    }
    // Update other properties
    p.scale_unit = md.element('unit').value.trim();
    p.equal_bounds = this.getEqualBounds('product-UB-equal');
    p.is_source = this.boxChecked('product-source');
    p.is_sink = this.boxChecked('product-sink');
    // NOTE: do not unset is_data if product has ingoing data arrows
    p.is_data = p.hasDataInputs || this.boxChecked('product-data');
    p.is_buffer = this.boxChecked('product-stock');
    p.integer_level = this.boxChecked('product-integer');
    p.no_slack = this.boxChecked('product-no-slack');
    const pnl = p.no_links;
    p.no_links = this.boxChecked('product-no-links');
    if(pnl !== p.no_links) {
      // Hide or show links => redraw (with new arrows)
      MODEL.focal_cluster.clearAllProcesses();
      UI.drawDiagram(MODEL);
    }
    MODEL.ioUpdate(p, this.getImportExportBox('product'));
    UI.paper.drawProduct(p);
    md.hide();
    return true;
  }

  // Cluster modal

  showClusterPropertiesDialog(c) {
    if(c.is_black_boxed) {
      this.notify('Black-boxed clusters cannot be edited');
      return;
    }
    this.dbl_clicked_node = c;
    const md = this.modals.cluster;
    md.element('action').innerText = 'Edit';
    md.element('name').value = c.name;
    if(c.actor.name == UI.NO_ACTOR) {
      md.element('actor-name').value = '';
    } else {
      md.element('actor-name').value = c.actor.name;
    }
    md.element('options').style.display = 'block';
    this.setBox('cluster-collapsed', c.collapsed);
    this.setBox('cluster-ignore', c.ignore);
    this.setBox('cluster-black-box', c.black_box);
    md.show();
  }
  
  // Link modal

  showLinkPropertiesDialog(l, attr='name', alt=false) {
    const
        from_process = l.from_node instanceof Process,
        to_process = l.to_node instanceof Process,
        md = this.modals.link;
    md.show();
    md.element('from-name').innerHTML = l.from_node.displayName;
    md.element('to-name').innerHTML = l.to_node.displayName;
    md.element('multiplier').value = l.multiplier;
    // NOTE: counter-intuitive, but "level" must always be the "from-unit", as
    // it is the "per" unit
    const
        fu = md.element('from-unit'),
        tu = md.element('to-unit');
    if(from_process) {
      fu.innerHTML = 'level';
      tu.innerHTML = l.to_node.scale_unit;
    } else if(to_process) {
      fu.innerHTML = 'level';      
      tu.innerHTML = l.from_node.scale_unit;
    } else {
      // Product-to-product link, so both products have a scale unit
      fu.innerHTML = l.from_node.scale_unit;
      tu.innerHTML = l.to_node.scale_unit;      
    }
    if(l.to_node.is_data) {
      // Spinning reserve can be "read" only from processes
      md.element('spinning').disabled = !from_process;
      // Allow link type selection
      md.element('multiplier-row').classList.remove('off');
    } else {
      // Disallow if TO-node is not a data product
      md.element('multiplier-row').classList.add('off');
    }
    this.updateLinkDataArrows();
    md.element('D').value = l.flow_delay.text;
    md.element('R').value = l.relative_rate.text;
    // NOTE: share of cost is input as a percentage
    md.element('share-of-cost').value = VM.sig4Dig(100 * l.share_of_cost);
    // No delay or share of cost for inputs of a process
    if(to_process) {
      md.element('output-row').style.display = 'none';
    } else {
      md.element('output-row').style.display = 'block';
      // Share of cost only for outputs of a process
      if(from_process) {
        md.element('output-soc').style.display = 'inline-block';
      } else {
        md.element('output-soc').style.display = 'none';
      }
    }
    if(alt) md.element(attr + '-x').dispatchEvent(new Event('click'));
  }

  updateLinkDataArrows() {
    // Sets the two link arrow symbols in the Link modal header
    const
        a1 = document.getElementById('link-arrow-1'),
        a2 = document.getElementById('link-arrow-2'),
        lm = document.getElementById('link-multiplier').value,
        d = document.getElementById('link-D'),
        deb = document.getElementById('link-D-x');
    // NOTE: selector value is a string, not a number
    if(lm === '0') {
      // Default link symbol is a solid arrow
      a1.innerHTML = '&#x279D;';
      a2.innerHTML = '&#x279D;';
    } else {
      // Data link symbol is a three-dash arrow
      a1.innerHTML = '&#x290F;';
      a2.innerHTML = '&#x290F;';
    }
    // NOTE: use == as `lm` is a string
    if(lm == VM.LM_PEAK_INC) {
      // Peak increase data link has no delay
      d.disabled = true;
      d.style.color = 'gray';
      d.style.backgroundColor = 'inherit';
      d.value = '0';
      // Also disable its "edit expression" button 
      deb.classList.remove('enab');
      deb.classList.add('disab');
    } else {
      d.disabled = false;
      d.style.color = 'black';
      d.style.backgroundColor = 'white';
      deb.classList.remove('disab');
      deb.classList.add('enab');
    }
  }
  
  updateLinkProperties() {
    // @@TO DO: prepare for undo
    const
        md = this.modals.link,
        l = this.on_link;
    // Check whether all input fields are valid
    if(!this.updateExpressionInput('link-R', 'rate', l.relative_rate)) {
      return false;
    }
    let soc = this.validNumericInput('link-share-of-cost', 'share of cost');
    if(soc === false) return false;
    if(soc < 0 || soc > 100) {
      md.element('share-of-cost').focus();
      UI.warn('Share of cost can range from 0 to 100%');
      return false;
    }
    if(!this.updateExpressionInput('link-D', 'delay', l.flow_delay)) {
      return false;
    }
    const
        m = parseInt(md.element('multiplier').value),
        redraw = m !== l.multiplier &&
            (m === VM.LM_FIRST_COMMIT || l.multiplier === VM.LM_FIRST_COMMIT);
    l.multiplier = m;
    l.relative_rate.text = md.element('R').value.trim();
    if(l.multiplier !== VM.LM_LEVEL && soc > 0) {
      soc = 0; 
      this.warn('Cost can only be attributed to level-based links');
    }
    // NOTE: share of cost is input as a percentage, but stored as a floating
    // point value between 0 and 1
    l.share_of_cost = soc / 100;
    md.hide();
    // Redraw the arrow shape that represents the edited link
    this.paper.drawArrow(this.on_arrow);
    // Redraw the FROM node if link has become (or no longer is) "first commit"
    if(redraw) this.drawObject(this.on_arrow.from_node);
  }

  // NOTE: Constraint modal is controlled by a dedicated class ConstraintEditor 

  showConstraintPropertiesDialog(c) {
    // Display the constraint editor
    document.getElementById('ce-from-name').innerHTML = c.from_node.displayName;
    document.getElementById('ce-to-name').innerHTML = c.to_node.displayName;
    CONSTRAINT_EDITOR.showDialog();
  }

  showReplaceProductDialog(p) {
    // Prompts for a product (different from `p`) by which `p` should be
    // replaced for the selected product position
    const pp = MODEL.focal_cluster.indexOfProduct(p);
    if(pp >= 0) {
      MODEL.clearSelection();
      MODEL.selectList([p]);
      this.drawObject(p);
      // Make list of nodes related to P by links
      const rel_nodes = [];
      for(let i = 0; i < p.inputs.length; i++) {
        rel_nodes.push(p.inputs[i].from_node);
      }
      for(let i = 0; i < p.outputs.length; i++) {
        rel_nodes.push(p.outputs[i].to_node);
      }
      const options = [];
      for(let i in MODEL.products) if(MODEL.products.hasOwnProperty(i) &&
          // NOTE: do not show "black-boxed" products
          !i.startsWith(UI.BLACK_BOX)) {
        const po = MODEL.products[i];
        // Skip the product that is to be replaced, an also products having a
        // different type (regular product or data product) 
        if(po !== p && po.is_data === p.is_data) {
          // NOTE: also skip products PO that are linked to a node Q that is
          // already linked to P (as replacing would then create a two-way link)
          let no_rel = true; 
          for(let j = 0; j < po.inputs.length; j++) {
            if(rel_nodes.indexOf(po.inputs[j].from_node) >= 0) {
              no_rel = false;
              break;
            }
          }
          for(let j = 0; j < po.outputs.length; j++) {
            if(rel_nodes.indexOf(po.outputs[j].to_node) >= 0) {
              no_rel = false;
              break;
            }
          }
          if(no_rel) options.push('<option text="', po.displayName, '">',
              po.displayName, '</option>');
        }
      }
      const md = this.modals.replace;
      if(options.length > 0) {
        md.element('by-name').innerHTML = options.join('');
        const pne = md.element('product-name');
        pne.innerHTML = p.displayName;
        // Show that product is data by a dashed underline
        if(p.is_data) {
          pne.classList.add('is-data');
        } else {
          pne.classList.remove('is-data');
        }
        // By default, replace only locally
        this.setBox('replace-local', true);
        md.show();
      } else {
        this.warn('No eligable products to replace ' + p.displayName);
      }
    }
  }
  
  replaceProduct() {
    // Replace occurrence(s) of specified product P by product R
    // NOTE: P is still selected, so clear it
    MODEL.clearSelection();
    const
        md = this.modals.replace,
        erp = md.element('product-name'),
        erb = md.element('by-name'),
        global = !this.boxChecked('replace-local');
    if(erp && erb) {
      const
          p = MODEL.objectByName(erp.innerHTML),
          rname = erb.options[erb.selectedIndex].text,
          r = MODEL.objectByName(rname);
      if(p instanceof Product) {
        if(r instanceof Product) {
          MODEL.replaceProduct(p, r, global);
          md.hide();
        } else {
          UI.warn(`No product "${rname}"`);
        }
      } else {
        UI.warn(`No product "${erp.text}"`);
      }
    }
  }
  
} // END of class GUIController


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
    for(let i = 0; i < b; i++) {
      total_time += VM.solver_times[i];
    }
    const n = document.createElement('div');
    n.classList.add('progress-block');
    if(err) n.classList.add('error-pb');
    if(b % 2 == 0) n.classList.add('even-pb');
    n.setAttribute('title',
        `Block #${b} took ${time.toPrecision(3)} seconds
(solver: ${VM.solver_secs[b - 1]} seconds)`);
    n.setAttribute('data-blk', b); 
    n.addEventListener('click',
        (event) => {
            const el = event.target;
            el.classList.add('sel-pb');
            MONITOR.showBlock(el.getAttribute('data-blk'));
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
    for(let i = 0; i < cn.length; i++) {
      cn[i].classList.remove('sel-pb');
    }
    cn[b - 1].classList.add('sel-pb');
    this.updateContent(this.tab);
  }

  updateDialog() {
    // Implements default behavior for a draggable/resizable dialog
    this.updateContent(this.tab);
  }
  
  updateContent(tab) {
    // Get the block being computed
    this.block_count = VM.block_count;
    // Shows the appropriate text in the monitor's textarea
    let b = this.shown_block;
    // By default, show information on the block being calculated
    if(b === 0) b = this.block_count;
    if(this.block_count === 0) {
      this.messages_text.value = VM.no_messages;
      this.equations_text.value = VM.no_equations;
    } else if(b <= VM.messages.length) {
      this.messages_text.value = VM.messages[b - 1];
      this.equations_text.value = VM.equations[b - 1];
    }
    // Legend to variables is not block-dependent
    this.variables_text.value = VM.variablesLegend(b);
    // Show the text area for the selected tab
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
    // Show the error message in the dialog header
    // NOTE: prevent showing again when VM detects multiple errors
    if(this.call_stack_shown) return;
    const
        csl = VM.call_stack.length,
        err = VM.call_stack[csl - 1].vector[t],
        // Make separate lists of variable names and their expressions
        vlist = [],
        xlist = [];
    document.getElementById('call-stack-error').innerHTML =
        `ERROR at t=${t}: ` + VM.errorMessage(err);
    for(let i = 0; i < csl; i++) {
      const x = VM.call_stack[i];
      vlist.push(x.object.displayName + '|' + x.attribute);
      // Trim spaces around all object-attribute separators in the expression
      xlist.push(x.text.replace(/\s*\|\s*/g, '|'));
    }
    // Highlight variables where they are used in the expressions
    const vcc = UI.chart_colors.length;
    for(let i = 0; i < xlist.length; i++) {
      for(let j = 0; j < vlist.length; j++) {
        // Ignore selectors, as these may be different per experiment
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
    // Then also color the variables
    for(let i = 0; i < vlist.length; i++) {
      vlist[i] = '<span style="font-weight: 600; color: ' +
        `${UI.chart_colors[i % vcc]}">${vlist[i]}</span>`;
    }
    // Start without indentation
    let pad = 0;
    // First show the variable being computed
    const tbl = ['<div>', vlist[0], '</div>'];
    // Then iterate upwards over the call stack
    for(let i = 0; i < vlist.length - 1; i++) {
      // Show the expression, followed by the next computed variable
      tbl.push(['<div class="call-stack-row" style="padding-left: ',
        pad, 'px"><div class="call-stack-expr">', xlist[i],
        '</div><div class="call-stack-vbl">&nbsp;\u2937', vlist[i+1],
        '</div></div>'].join(''));
      // Increase indentation
      pad += 8;
    }
    // Show the last expression, highlighting the array-out-of-bounds (if any)
    let last_x = xlist[xlist.length - 1],
        anc = '';
    if(VM.out_of_bounds_array) {
      anc = '<span style="font-weight: 600; color: red">' +
          VM.out_of_bounds_array + '</span>';
      last_x = last_x.split(VM.out_of_bounds_array).join(anc);
    }
    tbl.push('<div class="call-stack-expr" style="padding-left: ' +
        `${pad}px">${last_x}</div>`);
    // Add index-out-of-bounds message if appropriate
    if(anc) {
      tbl.push('<div style="color: gray; margin-top: 8px; font-size: 10px">',
          VM.out_of_bounds_msg.replace(VM.out_of_bounds_array, anc), '</div>');
    }
    document.getElementById('call-stack-table').innerHTML = tbl.join('');
    document.getElementById('call-stack-modal').style.display = 'block';
    this.call_stack_shown = true;    
  }

  hideCallStack() {
    document.getElementById('call-stack-modal').style.display = 'none';
  }

  logMessage(block, msg) {
    // Appends a solver message to the monitor's messages textarea
    if(this.messages_text.value === VM.no_messages) {
      // Erase the "(no messages)" if still showing
      this.messages_text.value = '';
    }
    if(this.shown_block === 0 && block !== this.last_message_block) {
      // Clear text area when starting with new block while no block selected
      this.last_message_block = block;
      this.messages_text.value = '';      
    }
    // NOTE: `msg` is appended only if no block has been selected by
    // clicking on the progress bar, or if the message belongs to the
    // selected block
    if(this.shown_block === 0 || this.shown_block === block) {
      this.messages_text.value += msg + '\n';
    }
  }
  
  logOnToServer(usr, pwd) {
    VM.solver_user = usr;
    fetch('solver/', postData({action: 'logon', user: usr, password: pwd}))
      .then((response) => {
          if(!response.ok) {
            UI.alert(`ERROR ${response.status}: ${response.statusText}`);
          }
          return response.text();
        })
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
            VM.solver_name = jsr.solver;
            // Remote solver may indicate user-specific solver time limit
            let utl = '';
            if(jsr.time_limit) {
              VM.max_solver_time = jsr.time_limit;
              utl = ` -- ${VM.solver_name} solver: ` +
                  `max. ${VM.max_solver_time} seconds per block`;
              // If user has a set time limit, no restrictions on tableau size
              VM.max_tableau_size = 0;
            }
            UI.notify('Logged on to ' + jsr.server + utl);
          } else {
            UI.warn('Authentication failed -- NOT logged on to server -- ' +
                'Click <a href="solver/?action=password">' +
                '<strong>here</strong></a> to change password');
          }
        })
      .catch((err) => UI.warn(UI.WARNING.NO_CONNECTION, err));
  }

  connectToServer() {
    // Prompts for credentials if not connected yet
    // NOTE: no authentication prompt if SOLVER.user_id in `linny-r-config.js`
    // is left blank
    if(!VM.solver_user) {
      VM.solver_token = 'local host';
      fetch('solver/', postData({action: 'logon'}))
        .then((response) => {
            if(!response.ok) {
              UI.alert(`ERROR ${response.status}: ${response.statusText}`);
            }
            return response.text();
          })
        .then((data) => {
            try {
              const jsr = JSON.parse(data);
              if(jsr.solver !== VM.solver_name) {
                UI.notify(`Solver on ${jsr.server} is ${jsr.solver}`);              
              }
              VM.solver_name = jsr.solver;
            } catch(err) {
              console.log(err, data);
              UI.alert('ERROR: Unexpected data from server: ' +
                  ellipsedText(data));
              return;
            }
          })
        .catch((err) => UI.warn(UI.WARNING.NO_CONNECTION, err));
    }
    if(VM.solver_token) return true;
    UI.loginPrompt();
    return false;
  }

  submitBlockToSolver(bcode) {
    let top = MODEL.timeout_period;
    if(VM.max_solver_time && top > VM.max_solver_time) {
      top = VM.max_solver_time;
      UI.notify('Solver time limit for this server is ' +
          VM.max_solver_time + ' seconds');
    }
    const bwr = VM.blockWithRound;
    UI.logHeapSize(`BEFORE submitting block #${bwr} to solver`);
    fetch('solver/', postData({
          action: 'solve',
          user: VM.solver_user,
          token: VM.solver_token,
          block: VM.block_count,
          round: VM.round_sequence[VM.current_round],
          data: bcode,
          timeout: top
        }))
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
            // If no errors, solve next block (if any)
            // NOTE: use setTimeout so that this calling function returns,
            // and browser can update its DOM to display progress
            setTimeout(() => VM.solveBlocks(), 1);
          } catch(err) {
            // Log details on the console
            console.log('ERROR while parsing JSON:', err);
            console.log(data);
            // Pass summary on to the browser
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
    VM.logMessage(VM.block_count,
        `POSTing block #${bwr} took ${VM.elapsedTime} seconds.`);
    UI.logHeapSize(`AFTER posting block #${bwr} to solver`);
  }
  
} // END of class GUIMonitor


// CLASS GUIFileManager provides the GUI for loading and saving models and
// diagrams and handles the interaction with the MILP solver via POST requests
// to the server.
// NOTE: because the console-only monitor requires Node.js modules, this
// GUI class does NOT extend its console-only counterpart
class GUIFileManager {

  getRemoteData(dataset, url) {
    // Gets data from a URL, or from a file on the local host 
    if(url === '') return;
    // NOTE: add this dataset to the "loading" list...
    addDistinct(dataset, MODEL.loading_datasets);
    // ... and allow for 3 more seconds (6 times 500 ms) to complete
    MODEL.max_time_to_load += 6;
    // Send the "load data" request to the server
    fetch('load-data/', postData({'url': url}))
      .then((response) => {
          if(!response.ok) {
            UI.alert(`ERROR ${response.status}: ${response.statusText}`);
          }
          return response.text();
        })
      .then((data) => {
          if(data !== '' && UI.postResponseOK(data)) {
            // Server must return either semicolon-separated or
            // newline-separated string of numbers
            if(data.indexOf(';') < 0) {
              // If no semicolon found, replace newlines by semicolons
              data = data.trim().split('\n').join(';');
            }
            // Remove all white space
            data = data.replace(/\s+/g, '');
            // Show data in text area when the SERIES dialog is visible
            if(!UI.hidden('series-modal')) {
              DATASET_MANAGER.series_data.value = data.split(';').join('\n');
            } else {
              dataset.unpackDataString(data);
            }
            // NOTE: remove dataset from the "loading" list
            const i = MODEL.loading_datasets.indexOf(dataset);
            if(i >= 0) MODEL.loading_datasets.splice(i, 1);
          }
        })
      .catch((err) => UI.warn(UI.WARNING.NO_CONNECTION, err));
  }

  decryptIfNeeded(event, action) {
    // Checks whether XML is encrypted; if not, processes data "as is", otherwise
    // prompts for password
    const data = event.target.result;
    if(data.indexOf('model latch="') < 0) return action(data);
    const
        xml = parseXML(data),
        md = UI.modals.password;
    md.encrypted_msg = {
        encryption: nodeContentByTag(xml, 'content'),
        latch: nodeParameterValue(xml, 'latch')
      };
    md.post_decrypt_action = action;
    md.element('action').innerHTML = 'Enter';
    md.ok = UI.removeListeners(md.ok);
    md.ok.addEventListener('click', () => FILE_MANAGER.startToDecrypt());
    this.updateStrength();
    md.show('code');
  }
  
  startToDecrypt() {
    // Wrapper function to permit DOM events to occur first
    const
        md = UI.modals.password,
        encr_msg = md.encrypted_msg,
        code = md.element('code'),
        password = code.value;
    // NOTE: immediately clear password field
    code.value = '';
    md.hide();
    UI.waitingCursor();
    UI.setMessage('Decrypting...');
    // NOTE: asynchronous function tryToDecrypt is defined in linny-r-utils.js
    setTimeout((msg, pwd, ok, err) => tryToDecrypt(msg, pwd, ok, err), 5,
        encr_msg, password,
        // The on_ok function
        (data) => {
            UI.normalCursor();
            const md = UI.modals.password;
            if(data) md.post_decrypt_action(data);
            md.encrypted_msg = null;
            md.post_decrypt_action = null;
          },
        // The on_error function
        (err) => {
            console.log(err);
            UI.warn('Failed to load encrypted model');
            const md = UI.modals.password;
            md.encrypted_msg = null;
            md.post_decrypt_action = null;
          });
  }
  
  readModel(event) {
    // Read XML string from input file, decrypt if necessary, and then parse it
    this.decryptIfNeeded(event, (data) => UI.loadModelFromXML(data));
  }  
  
  loadModel() {
    // Get the XML of the file selected in the Load dialog
    const md = UI.modals.load;
    md.hide();
    try {
      const file = md.element('xml-file').files[0];
      if(!file) return;
      if(file.name.split('.').pop() != 'lnr') {
        UI.warn('Linny-R files should have extension .lnr');
      }
      const reader = new FileReader();
      reader.onload = (event) => FILE_MANAGER.readModel(event);
      reader.readAsText(file);
    } catch(err) {
      UI.alert('Error while reading file: ' + err);
    }
  }

  promptToLoad() {
    // Show "Load model" modal
    // @@TO DO: warn user if unsaved changes to current model
    UI.hideStayOnTopDialogs();
    // Update auto-saved model list; if not empty, this will display the
    // "restore autosaved files" button
    AUTO_SAVE.getAutoSavedModels();
    // Show the "Load model" dialog
    UI.modals.load.show();
  }

  readModelToCompare(event) {
    // Read model-to-compare from input file, decrypting if necessary
    this.decryptIfNeeded(event,
        (data) => DOCUMENTATION_MANAGER.compareModels(data));
  }  
  
  loadModelToCompare() {
    document.getElementById('comparison-modal').style.display = 'none';
    try {
      const file = document.getElementById('comparison-xml-file').files[0];
      if(!file) return;
      if(file.name.split('.').pop() != 'lnr') {
        UI.warn('Linny-R files should have extension .lnr');
      }
      const reader = new FileReader();
      reader.onload = (event) => FILE_MANAGER.readModelToCompare(event);
      reader.readAsText(file);
    } catch(err) {
      UI.alert('Error while reading file: ' + err);
    }
  }
  
  passwordStrength(pwd) {
    if(pwd.length < CONFIGURATION.min_password_length) return 0;
    let score = 1;
    if(pwd.match(/[a-z]/) && pwd.match(/[A-Z]/)) score++;
    if(pwd.match(/\d+/)) score++;
    if(pwd.match(/.[!,@,#,$,%,^,&,*,?,_,~,-,(,)]/)) score++;
    if(pwd.length > CONFIGURATION.min_password_length + 4) score++;
    return score;
  }
  
  updateStrength() {
    // Relects password strength in password field colors
    const code = document.getElementById('password-code');
    if(document.getElementById('password-action').innerHTML === 'Set') {
      code.className = 'pws-' + this.passwordStrength(code.value);
    } else {
      code.className = '';
    }
  }
  
  confirmPassword() {
    const
        md = UI.modals.password,
        code = md.element('code');
    md.encryption_code = code.value;
    // NOTE: immediately clear password field
    code.value = '';
    if(md.encryption_code.length < CONFIGURATION.min_password_length) {
      UI.warn('Password must be at least '+ CONFIGURATION.min_password_length +
          ' characters long');
      md.encryption_code = '';
      code.focus();
      return;
    }
    md.element('action').innerHTML = 'Confirm';
    md.ok = UI.removeListeners(md.ok);
    md.ok.addEventListener('click', () => FILE_MANAGER.encryptModel());
    this.updateStrength();
    code.focus();
  }
  
  saveModel() {
    MODEL.clearSelection();
    if(MODEL.encrypt) {
      const md = UI.modals.password;
      md.encryption_code = '';
      md.element('action').innerHTML = 'Set';
      md.ok = UI.removeListeners(md.ok);
      md.ok.addEventListener('click', () => FILE_MANAGER.confirmPassword());
      this.updateStrength();
      md.show('code');
      return;
    }
    // NOTE: Encode hashtags, or they will break the URI.
    this.pushModelToBrowser(MODEL.asXML.replace(/#/g, '%23'));
  }
  
  pushModelToBrowser(xml) {
    UI.setMessage('Model file size: ' + UI.sizeInBytes(xml.length));
    const el = document.getElementById('xml-saver');
    el.href = 'data:attachment/text,' + encodeURI(xml);
    console.log('Encoded file size:', el.href.length);
    el.download = 'model.lnr';
    if(el.href.length > 25*1024*1024 &&
        navigator.userAgent.search('Chrome') <= 0) {
      UI.notify('Model file size exceeds 25 MB. ' +
          'If it does not download, store it in a repository');
    }
    el.click();
    UI.normalCursor();
  }
  
  encryptModel() {
    const
        md = UI.modals.password,
        code = md.element('code'),
        pwd = code.value;
    // NOTE: immediately clear password field
    code.value = '';
    md.hide();
    if(pwd !== md.encryption_code) {
      UI.warn('Encryption passwords did not match');
      return;
    }
    UI.setMessage('Encrypting...');
    UI.waitingCursor();
    // Wait for key (NOTE: asynchronous functions defined in linny-r.js)
    encryptionKey(pwd)
      .then((key) => encryptMessage(MODEL.asXML.replace(/#/g, '%23'), key)
          .then((enc) => this.pushModelToBrowser(MODEL.asEncryptedXML(enc)))
          .catch((err) => {
              UI.alert('Encryption failed');
              console.log(err);
            }))
      .catch((err) => {
          UI.alert('Failed to get encryption key');
          console.log(err);
        });
  }

  loadAutoSavedModel(name) {  
    fetch('autosave/', postData({
          action: 'load',
          file: name
        }))
      .then((response) => {
          if(!response.ok) {
            UI.alert(`ERROR ${response.status}: ${response.statusText}`);
          }
          return response.text();
        })
      .then((data) => {
          if(UI.postResponseOK(data)) UI.loadModelFromXML(data);
        })
      .catch((err) => UI.warn(UI.WARNING.NO_CONNECTION, err));
  }

  storeAutoSavedModel() {
    // Stores the current model in the local auto-save directory
    const bcl = document.getElementById('autosave-btn').classList;
    if(MODEL.running_experiment) {
      console.log('No autosaving while running an experiment');
      bcl.remove('stay-activ');
      return;
    }
    fetch('autosave/', postData({
          action: 'store',
          file: REPOSITORY_BROWSER.asFileName(
              (MODEL.name || 'no-name') + '_by_' +
                  (MODEL.author || 'no-author')),
          xml: MODEL.asXML
        }))
      .then((response) => {
          if(!response.ok) {
            UI.alert(`ERROR ${response.status}: ${response.statusText}`);
          }
          return response.text();
        })
      .then((data) => {
          UI.postResponseOK(data);
          bcl.remove('stay-activ');
        })
      .catch((err) => {
          UI.warn(UI.WARNING.NO_CONNECTION, err);
          bcl.remove('stay-activ');
        });
  }

  renderDiagramAsPNG() {
    localStorage.removeItem('png-url');
    UI.paper.fitToSize();
    MODEL.alignToGrid();
    this.renderSVGAsPNG(UI.paper.svg.outerHTML);
  }
  
  renderSVGAsPNG(svg) {
    // Sends SVG to the server, which will convert it to PNG using Inkscape;
    // if successful, the server will return the URL to the PNG file location;
    // this URL is passed via the browser's local storage to the newly opened
    // browser tab that awaits this URL and then loads it
    const form = {
            action: 'png',
            user: VM.solver_user,
            token: VM.solver_token,
            data: btoa(encodeURI(svg))
          };
    fetch('solver/', postData(form))
      .then((response) => {
          if(!response.ok) {
            UI.alert(`ERROR ${response.status}: ${response.statusText}`);
          }
          return response.text();
        })
      .then((data) => {
          // Pass URL of image to the newly opened browser window
          localStorage.setItem('png-url', data);
        })
      .catch((err) => UI.warn(UI.WARNING.NO_CONNECTION, err));
  }
  
  saveDiagramAsSVG() {
    UI.paper.fitToSize();
    MODEL.alignToGrid();
    this.pushOutSVG(UI.paper.outerHTML);
  }
  
  pushOutSVG(svg) {
    const blob = new Blob([svg], {'type': 'image/svg+xml'});
    const e = document.getElementById('svg-saver');
    e.download = 'model.svg';
    e.type = 'image/svg+xml';
    e.href = (window.URL || webkitURL).createObjectURL(blob);
    e.click();
  }  
 
} // END of class GUIFileManager


class ExpressionEditor {
  constructor() {
    this.dataset_dot_option = '. (this dataset)';
    this.edited_input_id = '';
    this.edited_expression = null;
    // Dialog DOM elements
    this.property = document.getElementById('expression-property');
    this.text = document.getElementById('expression-text');
    this.status = document.getElementById('expression-status');
    this.info = document.getElementById('expression-info');
    // The DOM elements for the "insert variable" bar
    this.obj = document.getElementById('variable-obj');
    this.name = document.getElementById('variable-name');
    this.attr = document.getElementById('variable-attr');
    // The quick guide to Linny-R expressions
    this.info.innerHTML = `
<h3>Linny-R expressions</h3>
<p><em>NOTE: Move cursor over a</em> <code>symbol</code>
  <em>for explanation.</em>
<p>
<h4>Variables</h4>
<p>
  Attributes of <em
  title="i.e., processes, products, links, clusters, actors and datasets"
  >entities</em> are enclosed by brackets, with a vertical bar between
  entity name and <em>property selector</em>, e.g.,
  <code title="NOTE: Entity names are not sensitive to case or spacing.
Attributes, however, are case sensitive!">[Actor X|CF]</code> for cash flow.
  Solver properties
  (<code title="Absolute time step (starts at t&#8320;)">t</code>,
  <code title="Relative time step (t &minus; t&#8320; + 1)">rt</code>,
  <code title="Number of current block">b</code>,
  <code title="Time step within current block">bt</code>,
  <code title="Duration of 1 time step (in hours)">dt</code>,
  <code title="Run length (# time steps)">N</code>,
  <code title="Block length (# time steps)">n</code>,
  <code title="Look-ahead (# time steps)">l</code>,
  <code title="Number of current round (1=a, 2=b, etc.)">r</code>,
  <code title="Number of last round in the sequence (1=a, 2=b, etc.)">lr</code>,
  <code title="Number of rounds in the sequence">nr</code>,
  <code title="Number of current experiment run (starts at 0)">x</code>,
  <code title="Number of runs in the experiment">nx</code>,
  <code title="Number of time steps in 1 year)">yr</code>,
  <code title="Number of time steps in 1 week)">wk</code>,
  <code title="Number of time steps in 1 day)">d</code>,
  <code title="Number of time steps in 1 hour)">h</code>,
  <code title="Number of time steps in 1 minute)">m</code>,
  <code title="Number of time steps in 1 second)">s</code>,
  <code title="A random number from the uniform distribution U(0, 1)">random</code>)
  and constants (<code title="Mathematical constant &pi; = ${Math.PI}">pi</code>,
  <code title="Logical constant true = 1
NOTE: any non-zero value evaluates as true">true</code>,
  <code title="Logical constant false = 0">false</code>,
  <code title="The value used for &lsquo;unbounded&rsquo; variables (` +
    VM.PLUS_INFINITY.toExponential() + `)">infinity</code>)
    are <strong><em>not</em></strong> enclosed by brackets.
</p>
<h4>Operators</h4>
<p><em>Monadic:</em>
  <code title="-X evaluates as minus X">-</code>, 
  <code title="not X evaluates as 1 if X equals 0 (otherwise 0)">not</code>,
  <code title="abs X evaluates as the absolute value of X">abs</code>,
  <code title="int X evaluates as the integer part of X">int</code>,
  <code title="fract X evaluates as the decimal fraction of X">fract</code>,
  <code title="round X evaluates as X rounded to the nearest integer">round</code>,
  <code title="sqrt X evaluates as the square root of X">sqrt</code>,
  <code title="ln X evaluates as the natural logarithm of X">ln</code>,
  <code title="exp X evaluates as \u{1D452} raised to the power of X">exp</code>,
  <code title="sin X evaluates as the sine of X">sin</code>,
  <code title="cos X evaluates as the cosine of X">cos</code>,
  <code title="atan X evaluates as the inverse tangent of X">atan</code>,
  <code title="binomial X evaluates as a random number from the Binomial(N, p) distribution">binomial</code>,
  <code title="exponential X evaluates as a random number from the Exponential(&lambda;) distribution">exponential</code>,
  <code title="normal(X;Y) evaluates as a random number from the Normal(&mu;,&sigma;) distribution">normal</code>,
  <code title="poisson(X) evaluates as a random number from the Poisson(&lambda;) distribution">poisson</code>,
  <code title="triangular(X;Y;Z) evaluates as a random number from the Triangular(a,b,c) distribution
NOTE: When omitted, the third parameter c defaults to (a+b)/2">triangular</code>,
  <code title="weibull(X;Y) evaluates as a random number from the Weibull(&lambda;,k) distribution">weibull</code>,
  <code title="max(X1;&hellip;;Xn) evaluates as the highest value of X1, &hellip;, Xn">max</code>,
  <code title="min(X1;&hellip;;Xn) evaluates as the lowest value of X1, &hellip;, Xn">min</code>,
  <code title="npv(R;N;CF) evaluates as the net present value of a constant cash flow of CF
for a period of N time steps with a discount rate R, i.e., &Sigma; CF/(1+r)\u2071 for i=0, &hellip;, N-1.
NOTE: When the grouping contains more than 3 arguments, npv(R;X0;&hellip;;Xn)
considers X0, &hellip;, Xn as a variable cash flow time series.">npv</code><br>

  <em>Arithmetic:</em>
  <code title="X + Y = sum of X and Y">+</code>,
  <code title="X &minus; Y = difference between X and Y">-</code>,
  <code title="X * Y = product of X and Y">*</code>,
  <code title="X / Y = division of X by Y">/</code>,
  <code title="X % Y = the remainder of X divided by Y">%</code>,
  <code title="X ^ Y = X raised to the power of Y">^</code>,
  <code title="X log Y = base X logarithm of Y">log</code><br>

  <em>Comparison:</em>
  <code title="X = Y evaluates as 1 if X equals Y (otherwise 0)">=</code>,
  <code title="X &lt;&gt; Y evaluates as 1 if X does NOT equal Y (otherwise 0)">&lt;&gt;</code>
  or <code title="Alternative notation for X &lt;&gt; Y">!=</code>, 
  <code title="X &lt; Y evaluates as 1 if X is less than Y (otherwise 0)">&lt;</code>, 
  <code title="X &lt;= Y evaluates as 1 if X is less than or equal to Y (otherwise 0)">&lt;=</code>, 
  <code title="X &gt;= Y evaluates as 1 if X is greater than or equal to Y (otherwise 0)">&gt;=</code>, 
  <code title="X &gt; Y evaluates as 1 if X is greater than Y (otherwise 0)">&gt;</code><br> 

  <em>Logical:</em>
  <code title="X and Y evaluates as 1 if X and Y are both non-zero (otherwise 0)">and</code>, 
  <code title="X or Y evaluates as 1 unless X and Y are both zero (otherwise 0)">or</code><br>

  <em>Conditional:</em>
  <code title="X ? Y : Z evaluates as Y if X is non-zero, and otherwise as Z">X ? Y : Z</code>
  (can be read as <strong>if</strong> X <strong>then</strong> Y <strong>else</strong> Z)<br>

  <em>Resolving undefined values:</em>
  <code title="X | Y evaluates as Y if X is undefined, and otherwise as X">X | Y</code>
  (can be read as <strong>if</strong> X = &#x2047; <strong>then</strong> Y <strong>else</strong> X)<br>

  <em>Grouping:</em>
  <code title="X ; Y evaluates as a group or &ldquo;tuple&rdquo; (X, Y)
NOTE: Grouping groups results in a single group, e.g., (1;2);(3;4;5) evaluates as (1;2;3;4;5)">X ; Y</code>
  (use only in combination with <code>max</code>, <code>min</code> and probabilistic operators)<br>
</p>
<p>
  Monadic operators take precedence over dyadic operators.
  Use parentheses to override the default evaluation precedence.
</p>`;
    // Add listeners to the GUI elements
    const md = UI.modals.expression;
    md.ok.addEventListener('click', () => X_EDIT.parseExpression());
    md.cancel.addEventListener('click', () => X_EDIT.cancel());
    // NOTE: this modal also has an information button in its header
    md.info.addEventListener(
        'click', () => X_EDIT.toggleExpressionInfo());
    document.getElementById('variable-obj').addEventListener(
        'change', () => X_EDIT.updateVariableBar());
    document.getElementById('variable-name').addEventListener(
        'change', () => X_EDIT.updateAttributeSelector());
    document.getElementById('variable-insert').addEventListener(
        'click', () => X_EDIT.insertVariable());
  }

  editExpression(event) {
    // Infers which entity property expression is to edited from the button
    // that was clicked, and then opens the dialog
    const
        btn = event.target,
        ids = btn.id.split('-'), // 3-tuple [entity type, attribute, 'x']
        prop = btn.title.substring(20); // trim "Edit expression for "
    if(ids[0] === 'note') {
      UI.edited_object = UI.dbl_clicked_node;
      this.edited_input_id = 'note-C';
      if(UI.edited_object) {
        this.edited_expression = UI.edited_object.attributeExpression('C');
      } else {
        this.edited_expression = null;
      }
    } else {
      let n = '',
          a = '';
      if(ids[0] === 'link') {
        n = document.getElementById('link-from-name').innerHTML + UI.LINK_ARROW +
            document.getElementById('link-to-name').innerHTML;
      } else {
        n = document.getElementById(ids[0] + '-name').value;
        if(ids[0] === 'process') {
          a = document.getElementById('process-actor').value.trim();
        }
      }
      if(a) n += ` (${a})`;
      UI.edited_object = MODEL.objectByName(n);
      this.edited_input_id = UI.edited_object.type.toLowerCase() + '-' + ids[1];
      this.edited_expression = UI.edited_object.attributeExpression(ids[1]);
    }
    const md = UI.modals.expression;
    md.element('property').innerHTML = prop;
    md.element('text').value = document.getElementById(
        this.edited_input_id).value.trim();
    document.getElementById('variable-obj').value = 0;
    this.updateVariableBar();
    this.clearStatusBar();
    md.show('text');
  }
 
  cancel() {
    // Closes the expression editor dialog
    UI.modals.expression.hide();
    // Clear the "shortcut flag" that may be set by Shift-clicking the
    // "add chart variable" button in the chart dialog 
    EQUATION_MANAGER.add_to_chart = false;
  }
  
  parseExpression() {
    // Parses the contents of the expression editor
    let xt = this.text.value;
    // NOTE: the Insert button is quite close to the OK button, and often
    // the modeler clicks OK before Insert, leaving the expression empty;
    // hence assume that modeler meant to insert a variable if text is empty,
    // but all three variable components have been selected
    if(xt === '') {
      const
          n = this.name.options[this.name.selectedIndex].innerHTML,
          a = this.attr.options[this.attr.selectedIndex].innerHTML;
      if(n && a) xt = `[${n}${UI.OA_SEPARATOR}${a}]`;
    }
    // NOTE: If the expression is a dataset modifier or an equation, pass
    // the dataset and the selector as extra parameters for the parser 
    let own = null,
        sel = '';
    if(!this.edited_input_id && DATASET_MANAGER.edited_expression) {
      own = DATASET_MANAGER.selected_dataset;
      sel = DATASET_MANAGER.selected_modifier.selector;
    } else if(!this.edited_input_id && EQUATION_MANAGER.edited_expression) {
      own = MODEL.equations_dataset;
      sel = EQUATION_MANAGER.selected_modifier.selector;
    } else {
      own = UI.edited_object;
      sel = this.edited_input_id.split('-').pop();
    }
    const xp = new ExpressionParser(xt, own, sel);
    if(xp.error) {
      this.status.innerHTML = xp.error;
      this.status.style.backgroundColor = 'Yellow';
      SOUNDS.warning.play();
      this.text.focus();
      this.text.selectionStart = xp.pit - xp.los;
      this.text.selectionEnd = xp.pit;
      return false;
    } else {
      if(this.edited_input_id) {
        document.getElementById(this.edited_input_id).value = xp.expr;
        // NOTE: entity properties must be exogenous parameters
        if(UI.edited_object && xp.is_level_based) {
          UI.warn(['Expression for ', this.property.innerHTML,
              'of <strong>', UI.edited_object.displayName,
              '</strong> contains a solution-dependent variable'].join(''));
        }
        this.edited_input_id = '';
      } else if(DATASET_MANAGER.edited_expression) {
        DATASET_MANAGER.modifyExpression(xp.expr);
      } else if(EQUATION_MANAGER.edited_expression) {
        EQUATION_MANAGER.modifyEquation(xp.expr);
      }
      UI.modals.expression.hide();
      return true;
    }
  }
  
  clearStatusBar() {
    this.status.style.backgroundColor = UI.color.dialog_background;
    this.status.innerHTML = '&nbsp;';
  }
  
  namesByType(type) {
    // Returns a list of entity names of the specified types
    // (used only to generate the options of SELECT elements)
    // NOTE: When editing a dataset modifier expression, start the list of
    // datasets with the edited dataset (denoted by a dot) while omitting the
    // name of that dataset from the list
    let e,
        l = MODEL.setByType(type),
        n = [],
        dsn = null;
    if(type === 'Dataset' && DATASET_MANAGER.edited_expression) {
      dsn = DATASET_MANAGER.selected_dataset.name;
    }
    if(dsn) n.push(this.dot_option);
    for(e in l) if(l.hasOwnProperty(e) && e !== dsn &&
        // NOTE: do not display the equations dataset or "black-boxed" datasets
        !(e === UI.EQUATIONS_DATASET_ID || e.startsWith(UI.BLACK_BOX))) {
      n.push(l[e].displayName);
    }
    return n;
  }  
  
  updateVariableBar(prefix='') {
    // NOTE: this method is also called by the add-variable dialog of the
    // Chart Manager AND of the Sensitivity Analysis; in these cases, `prefix`
    // is passed to differentiate between the DOM elements to be used
    const
        type = document.getElementById(prefix + 'variable-obj').value,
        n_list = this.namesByType(VM.object_types[type]).sort(),
        vn = document.getElementById(prefix + 'variable-name'),
        options = [];
    // Add "empty" as first and initial option, but disable it.
    options.push('<option selected disabled value="-1"></option>');
    if(VM.object_types[type] === 'Equation') {
      // Hide the variable name, as this is the Equations Dataset
      vn.style.display = 'none';
    } else {
      for(let i = 0; i < n_list.length; i++) {
        // NOTE: no "dot option" when adding a chart variable or SA variable
        if(!(prefix && n_list[i] === this.dataset_dot_option)) {
          options.push(`<option value="${i}">${n_list[i]}</option>`);
        }
      }
      vn.innerHTML = options.join('');
      vn.value = -1;
      vn.style.display = 'inline-block';
    }
    this.updateAttributeSelector(prefix);
  }
  
  updateAttributeSelector(prefix='') {
    // Updates the attribute list -- only if a dataset has been selected.
    // NOTE: this method is also called by the add-variable dialog of the
    // Chart Manager AND of the Sensitivity Analysis; in these cases, `prefix`
    // is passed to differentiate between the DOM elements to be used
    const
        type = document.getElementById(prefix + 'variable-obj').value,
        vn = document.getElementById(prefix + 'variable-name'),
        va = document.getElementById(prefix + 'variable-attr'),
        options = [];
    if(VM.object_types[type] === 'Equation') {
      // Add "empty" as first and initial option, but disable it
      options.push('<option selected disabled value="-1"></option>');
      const d = MODEL.equations_dataset;
      if(d) {
        for(let m in d.modifiers) if(d.modifiers.hasOwnProperty(m)) {
          const s = d.modifiers[m].selector;
          options.push(`<option value="${s}">${s}</option>`);
        }
      }
      va.innerHTML = options.join('');
      // NOTE: Chart Manager variable dialog is 60px wider
      va.style.width = (prefix ? 'calc(100% - 82px)' : 'calc(100% - 142px)');
      return;
    }
    // Add "empty" as first and initial option, as it denotes "use default"
    va.style.width = '65px';
    options.push('<option value="-1" selected></option>');
    if(VM.object_types[type] === 'Dataset') {
      let d = null,
          v = vn.options[vn.selectedIndex].innerHTML;
      if(v === this.dataset_dot_option) {
        d = DATASET_MANAGER.selected_dataset;
      } else if(v) {
        d = MODEL.datasetByID(UI.nameToID(v));
      }
      if(d) {
        for(let m in d.modifiers) if(d.modifiers.hasOwnProperty(m)) {
          const s = d.modifiers[m].selector;
          options.push(`<option value="${s}">${s}</option>`);
        }
      }
    } else {
      const
          vt = document.getElementById('add-sa-variable-type'),
          a_list = VM.type_attributes[type];
      for(let i = 0; i < a_list.length; i++) {
        const att = a_list[i];
        // NOTE: for SA parameters, only show expression attributes
        if(!vt || vt.innerHTML !== 'parameter' ||
            VM.expression_attr.indexOf(att) >= 0) {
          options.push('<option value="', i,  '" title="',
            VM.attribute_names[att], '">', att, '</option>');
        }
      }
    }
    va.innerHTML = options.join('');      
  }
  
  insertVariable() {
    const type = this.obj.value;
    let n = this.name.options[this.name.selectedIndex].text,
        a = this.attr.options[this.attr.selectedIndex].text;
    if(VM.object_types[type] === 'Equation') {
      n = a;
      a = '';
    }
    if(n) {
      if(n === this.dataset_dot_option) n = '.';
      if(a) n += UI.OA_SEPARATOR + a;
      let p = this.text.selectionStart;
      const
          v = this.text.value,
          tb = v.substring(0, p),
          ta = v.substring(p, v.length);
      this.text.value = `${tb}[${n}]${ta}`;
      p += n.length + 2;
      this.text.setSelectionRange(p, p);
    }
    this.text.focus();
  }
  
  toggleExpressionInfo() {
    // Show/hide information pane with information on expression notation,
    // meanwhile changing the dialog buttons: when guide is showing, only
    // display a "close" button, otherwise info, OK and cancel
    const md = UI.modals.expression;
    if(window.getComputedStyle(this.info).display !== 'none') {
      this.info.style.display = 'none';
      md.ok.style.display = 'block';
      md.cancel.style.display = 'block';
      md.info.src = 'images/info.png';
    } else {
      this.info.style.display = 'block';
      md.ok.style.display = 'none';
      md.cancel.style.display = 'none';
      md.info.src = 'images/close.png';
    }
  }
  
} // END of class ExpressionEditor


// CLASS ModelAutoSaver automatically saves the current model at regular
// time intervals in the user's `autosave` directory
class ModelAutoSaver {
  constructor() {
    // Keep track of time-out interval of auto-saving feature
    this.timeout_id = 0;
    this.interval = 10; // auto-save every 10 minutes
    this.period = 24; // delete models older than 24 hours
    this.model_list = [];
    // Overwite defaults if settings still in local storage of browser
    this.getSettings();
    // Purge files that have "expired" 
    this.getAutoSavedModels();
    // Start the interval timer
    this.setAutoSaveInterval();
    // Add listeners to GUI elements
    this.confirm_dialog = document.getElementById('confirm-remove-models');
    document.getElementById('auto-save-clear-btn').addEventListener('click',
        () => AUTO_SAVE.confirm_dialog.style.display = 'block');
    document.getElementById('autosave-do-remove').addEventListener('click',
        // NOTE: file name parameter /*ALL*/ indicates: delete all
        () => AUTO_SAVE.getAutoSavedModels(true, '/*ALL*/'));
    document.getElementById('autosave-cancel').addEventListener('click',
        () => AUTO_SAVE.confirm_dialog.style.display = 'none');
    document.getElementById('restore-cancel').addEventListener('click',
        () => AUTO_SAVE.hideRestoreDialog(false));
    document.getElementById('restore-confirm').addEventListener('click',
        () => AUTO_SAVE.hideRestoreDialog(true));
  }
  
  getSettings() {
    // Reads custom auto-save settings from local storage
    try {
      const item = window.localStorage.getItem('Linny-R-autosave');
      if(item) {
        const
            mh = item.split('|'),
            m = parseFloat(mh[0]),
            h = parseFloat(mh[1]);
        if(isNaN(m) || isNaN(h)) {
          UI.warn('Ignored invalid local auto-save settings');
        } else {
          this.interval = m;
          this.period = h;
        }
      }
    } catch(err) {
      console.log('Local storage failed:', err);
    }  
  }
  
  setSettings() {
    // Writes custom auto-save settings to local storage
    try {
      window.localStorage.setItem('Linny-R-autosave',
          this.interval + '|' + this.period);
      UI.notify('New auto-save settings stored in browser');
    } catch(err) {
      UI.warn('Failed to write auto-save settings to local storage');
      console.log(err);
    }  
  }
  
  saveModel() {
    document.getElementById('autosave-btn').classList.add('stay-activ');
    // Use setTimeout to let browser always briefly show the active color
    // even when the model file is small and storing hardly takes time
    setTimeout(() => FILE_MANAGER.storeAutoSavedModel(), 300);
  }
  
  setAutoSaveInterval() {
    // Activate the auto-save feature (if interval is configured)
    if(this.timeout_id) clearInterval(this.timeout_id);
    // NOTE: interval = 0 indicates "do not auto-save"
    if(this.interval) {
      // Interval is in minutes, so multiply by 60 thousand to get msec
      this.timeout_id = setInterval(
          () => AUTO_SAVE.saveModel(), this.interval * 60000);
    }
  }

  getAutoSavedModels(show_dialog=false, file_to_delete='') {
    // Get list of auto-saved models from server (after deleting those that
    // have been stored beyond the set period AND the specified file to
    // delete (where /*ALL*/ indicates "delete all auto-saved files")
    const pd = {action: 'purge', period: this.period};
    if(file_to_delete) pd.to_delete = file_to_delete;
    fetch('autosave/', postData(pd))
      .then((response) => {
          if(!response.ok) {
            UI.alert(`ERROR ${response.status}: ${response.statusText}`);
          }
          return response.text();
        })
      .then((data) => {
          if(UI.postResponseOK(data)) {
            try {
              AUTO_SAVE.model_list = JSON.parse(data);
            } catch(err) {
              AUTO_SAVE.model_list = [];
              UI.warn('Data on auto-saved models is not valid');
            }
          }
          // Update auto-save-related dialog elements
          const
              n = this.model_list.length,
              ttl = pluralS(n, 'auto-saved model'),
              rbtn = document.getElementById('load-autosaved-btn');
          document.getElementById('autosave-btn').title = ttl;
          rbtn.title = ttl;
          rbtn.style.display = (n > 0 ? 'block' : 'none');
          if(show_dialog) AUTO_SAVE.showRestoreDialog();
        })
      .catch((err) => {console.log(err); UI.warn(UI.WARNING.NO_CONNECTION, err);});
  }

  showRestoreDialog() {
    // Shows list of auto-saved models; clicking on one will load it
    // NOTE: hide "Load model" dialog in case it was showing
    document.getElementById('load-modal').style.display = 'none';
    // Contruct the table to select from
    let html = '';
    for(let i = 0; i < this.model_list.length; i++) {
      const
          m = this.model_list[i],
          bytes = UI.sizeInBytes(m.size).split(' ');
      html += ['<tr class="dataset" style="color: gray" ',
          'onclick="FILE_MANAGER.loadAutoSavedModel(\'',
          m.name,'\');"><td class="restore-name">', m.name, '</td><td>',
          m.date.substring(1, 16).replace('T', ' '),
          '</td><td style="text-align: right">',
          bytes[0], '</td><td>', bytes[1], '</td><td style="width:15px">',
          '<img class="del-asm-btn" src="images/delete.png" ',
          'onclick="event.stopPropagation(); ',
          'AUTO_SAVE.getAutoSavedModels(true, \'', m.name,
          '\')"></td></tr>'].join('');
    }
    document.getElementById('restore-table').innerHTML = html;
    // Adjust dialog height (max-height will limit list to 10 lines)
    document.getElementById('restore-dlg').style.height =
        (48 + 19 * this.model_list.length) + 'px';
    document.getElementById('confirm-remove-models').style.display = 'none';
    // Fill text input fields with present settings
    document.getElementById('auto-save-minutes').value = this.interval;
    document.getElementById('auto-save-hours').value = this.period;
    // Show remove button only if restorable files exits
    const
      ttl = document.getElementById('restore-dlg-title'),
      sa = document.getElementById('restore-scroll-area'),
      btn = document.getElementById('auto-save-clear-btn');
    if(this.model_list.length) {
      ttl.innerHTML = 'Restore auto-saved model';
      sa.style.display = 'block';
      btn.style.display = 'block';
    } else {
      ttl.innerHTML = 'Auto-save settings (for this browser)';
      sa.style.display = 'none';
      btn.style.display = 'none';
    }
    document.getElementById('restore-modal').style.display = 'block';
  }
  
  hideRestoreDialog(save=true) {
    // Close the restore auto-save model dialog
    document.getElementById('confirm-remove-models').style.display = 'none';
    // NOTE: Cancel button or ESC will pass `cancel` as FALSE => do not save
    if(!save) {
      document.getElementById('restore-modal').style.display = 'none';
      return;
    }
    // Validate settings
    let m = this.interval,
        h = this.period,
        e = document.getElementById('auto-save-minutes');
    m = parseInt(e.value);
    if(!isNaN(m)) {
      e = document.getElementById('auto-save-hours');
      h = parseInt(e.value);
      if(!isNaN(h)) {
        // If valid, store in local storage of browser
        if(m !== this.interval || h !== this.period) {
          this.interval = m;
          this.period = h;
          this.setSettings();
          this.setAutoSaveInterval();
        }
        document.getElementById('restore-modal').style.display = 'none';
        return;
      }
    }
    UI.warn('Invalid auto-save settings');
    e.focus();
  }

} // END of class ModelAutoSaver


// CLASS ActorManager (modal dialog!)
class ActorManager {
  constructor() {
    // Make the Actors modal buttons responsive
    UI.modals.actors.ok.addEventListener(
        'click', () => ACTOR_MANAGER.updateActorProperties());
    UI.modals.actors.cancel.addEventListener(
        'click', () => UI.modals.actors.hide());
    this.dialog = document.getElementById('actors-dlg');
    this.round_count = document.getElementById('round-count');
    this.add_btn = document.getElementById('add-round-btn');
    this.add_btn.addEventListener(
        'click', () => ACTOR_MANAGER.addRound());
    this.delete_btn = document.getElementById('delete-round-btn');
    this.delete_btn.addEventListener(
        'click', () => ACTOR_MANAGER.deleteSelectedRound());
    this.sequence = document.getElementById('default-sequence');
    this.scroll_area = document.getElementById('actors-scroll');
    this.header = document.getElementById('rounds-hdr');
    this.table = document.getElementById('actors-table');
    // Modal related to this dialog
    this.actor_modal = new ModalDialog('actor');
    this.actor_modal.ok.addEventListener(
        'click', () => ACTOR_MANAGER.modifyActorEntry());
    this.actor_modal.cancel.addEventListener(
        'click', () => ACTOR_MANAGER.actor_modal.hide());
    this.actor_name = document.getElementById('actor-name');
    this.actor_span = document.getElementById('actor-span');
    this.actor_io = document.getElementById('actor-io');
    this.actor_io.addEventListener(
        'click', () => UI.toggleImportExportBox('actor'));
    this.actor_weight = document.getElementById('actor-W');
    document.getElementById('actor-W-x').addEventListener(
        'click', (event) => X_EDIT.editExpression(event));
    // Initialize properties
    this.rounds = 1;
    this.selected_round = 0;
  }
  
  roundLetter(n) {
    // Returns integer `n` as lower case letter: 1 = a, 2 = b, 26 = z
    // NOTE: numbers 27-52 return upper case A-Z; beyond ranges results in '?' 
    if(n < 1 || n > this.max_rounds) return '?';
    return VM.round_letters[n];
  }
  
  checkRoundSequence(s) {
    // Expects a string with zero or more round letters
    for(let i = 0; i < s.length; i++) {
      const n = VM.round_letters.indexOf(s[i]);
      if(n < 1 || n > this.rounds) {
        UI.warn(`Round ${s[i]} outside range (a` +
            (this.rounds > 1 ? '-' + this.roundLetter(this.rounds) : '') + ')');
        return false;    
      }
    }
    return s;
  }

  showDialog(reset=true) {
    // Display the "actor list view" modal
    let html = '';
    // Create a sorted actor list with items [id, name, flags, weight, iotype]
    // where flags is interpreted bitwise (bit N = 1 => checked for round N)
    if(reset) {
      // If reset, infer actor list and number of rounds from model
      MODEL.cleanUpActors();
      this.rounds = MODEL.rounds;
      this.selected_round = 0;
    }
    this.round_count.innerHTML = pluralS(this.rounds, 'round');
    if(this.rounds < VM.max_rounds) {
      this.add_btn.classList.remove('v-disab');
    } else {
      this.add_btn.classList.add('v-disab');
    }
    if(this.rounds > 1) {
      this.delete_btn.classList.remove('v-disab');
    } else {
      this.delete_btn.classList.add('v-disab');
    }
    this.sequence.placeholder =
        VM.round_letters.slice(1, this.rounds + 1) + ' (default)';
    this.sequence.value = MODEL.round_sequence;
    const ioc = ['', ' import', ' export'];
    for(let i = 0; i < MODEL.actor_list.length; i++) {
      const
          a = MODEL.actor_list[i],
          bits = a[2],
          rf = [];
      let b = 1;
      for(let r = 1; r <= this.rounds; r++) {
        rf.push('<div id="a-box-', i, '-', r, '" class="abox ',
            ((bits & b) != 0 ? 'checked' : 'clear'), '"></div>');
        b *= 2;
      }
      html += ['<tr class="actor" onmouseover="ACTOR_MANAGER.showActorInfo(',
          i, ', event.shiftKey);"><td id="a-name-', i,
          '" class="a-name', ioc[a[4]], '">', a[1], '</td><td id="a-weight-', i,
          '" class="a-weight">', a[3], '</td><td class="a-box">', rf.join(''),
          '</td></tr>'].join('');
    }
    const rows = Math.min(9, MODEL.actor_list.length - 1);
    this.dialog.style.height = (103 + 23 * rows) + 'px';
    this.dialog.style.width = (342 + (rows ? 18 : 0) + 22 * this.rounds) + 'px';
    this.scroll_area.style.height = (24 + 23 * rows) + 'px';
    this.scroll_area.style.overflowY = (rows ? 'scroll' : 'clip');
    // Update column headers
    const rch = [];
    for(let r = 1; r <= this.rounds; r++) {
      rch.push('<div id="round-', r, '" class="round-nr',
          (r == this.selected_round ? ' sel' : ''),
          '" onclick="ACTOR_MANAGER.toggleRound(', r, ', event.ctrlKey);">',
          this.roundLetter(r), '</div>');
    }
    this.header.innerHTML = rch.join('');
    this.table.innerHTML = html;
    // Bind click event to newly created checkboxes
    const
        abs = this.table.getElementsByClassName('abox'),
        abns = this.table.getElementsByClassName('a-name'),
        abws = this.table.getElementsByClassName('a-weight'),
        abf = (event) => UI.toggleBox(event),
        eaf = (event) => {
            // NOTE: The user has clicked on either cell 1 or cell 2 of a row
            // in the actors table, but both need to be passed on.
            const p = event.target.parentElement;
            // Pass name and weight of the selected actor (first and second
            // TD of this TR)
            ACTOR_MANAGER.showEditActorDialog(
                p.cells[0].innerText, p.cells[1].innerText);
          };
      for(let i = 0; i < abs.length; i++) {          
      abs[i].addEventListener('click', abf);
    }
    // Clicking the other cells should open the ACTOR dialog
    for(let i = 0; i < abns.length; i++) {          
      abns[i].addEventListener('click', eaf);
    }
    for(let i = 0; i < abws.length; i++) {          
      abws[i].addEventListener('click', eaf);
    }
    UI.modals.actors.show();
  }

  updateRoundFlags() {
    for(let i = 0; i < MODEL.actor_list.length; i++) {
      let rf = 0, b = 1;
      for(let r = 1; r <= this.rounds; r++) {
        const abox = document.getElementById(`a-box-${i}-${r}`);
        if(abox.classList.contains('checked')) rf += b;
        b *= 2;
      }
      MODEL.actor_list[i][2] = rf;
    }
  }

  addRound() {
    // Limit # rounds to 30 to cope with 32 bit integer used by JavaScript
    if(this.rounds < VM.max_rounds) {
      this.rounds++;
      this.round_count.innerHTML = pluralS(this.rounds, 'round');
      this.showDialog(false);
    }
  }
  
  deleteSelectedRound() {
    if(this.selected_round > 0 && this.selected_round <= this.rounds) {
      const mask = Math.pow(2, this.selected_round) - 1;
      this.updateRoundFlags();
      for(let i = 0; i < MODEL.actor_list.length; i++) {
        let rf = MODEL.actor_list[i][2];
        const
            low = (rf & mask),
            high = (rf & ~mask) >>> 1;
        MODEL.actor_list[i][2] = (low | high);
      }
      this.rounds--;
      this.selected_round = 0;
      this.showDialog(false);
    }
  }
  
  toggleRound(r, ctrl) {
    if(ctrl) {
      const check = !UI.boxChecked(`a-box-0-${r}`);
      for(let i = 0; i < MODEL.actor_list.length; i++) {
        UI.setBox(`a-box-${i}-${r}`, check);
      }
    } else {
      const el = document.getElementById('round-' + this.selected_round);
      if(el) el.classList.remove('sel');
      this.selected_round = r;
      document.getElementById('round-' + r).classList.add('sel');      
    }
  }
  
  showEditActorDialog(name, expr) {
    // Display modal for editing properties of one actor
    this.actor_span.innerHTML = name;
    this.actor_name.value = name;
    // Do not allow modification of the name '(no actor)'
    if(name === UI.NO_ACTOR) {
      this.actor_name.disabled = true;
      this.actor_io.style.display = 'none';
    } else {
      this.actor_name.disabled = false;
      UI.setImportExportBox('actor', MODEL.ioType(MODEL.objectByName(name)));
      this.actor_io.style.display = 'block';
    }
    this.actor_weight.value = expr;
    this.actor_modal.show();
  }
  
  modifyActorEntry() {
    // This method is called when the modeler submits the "actor properties"
    // dialog
    let n = this.actor_span.innerHTML,
        nn = UI.NO_ACTOR,
        x = this.actor_weight.value.trim(),
        xp = new ExpressionParser(x);
    if(n !== UI.NO_ACTOR) {
      nn = this.actor_name.value.trim();
      if(!UI.validName(nn)) {
        UI.warn(UI.WARNING.INVALID_ACTOR_NAME);
        return false;
      }
    }
    if(xp.error) {
      // NOTE: do not pass the actor, as its name is being edited as well
      UI.warningInvalidWeightExpression(null, xp.error);
      return false;
    }
    for(let i = 0; i < MODEL.actor_list.length; i++) {
      const a = MODEL.actor_list[i];
      if(a[1] == n) {
        // Always update the actors' `weight` and `import/export` properties...
        a[3] = x;
        a[4] = UI.getImportExportBox('actor');
        // .. but the `name` property NOT for "(no actor)"
        if(i !== 0) a[1] = nn;
        document.getElementById('a-weight-' + i).innerHTML = x;
        const td = document.getElementById('a-name-' + i);
        td.innerHTML = nn;
        td.classList.remove('import', 'export');
        if(a[4] === 1) {
          td.classList.add('import');
        } else if(a[4] === 2) {
          td.classList.add('export');
        }
        break;
      }
    }
    this.actor_modal.hide();
  }

  updateActorProperties() {
    // This method is called when the modeler clicks OK on the actor list dialog
    this.updateRoundFlags();
    const xp = new ExpressionParser('');
    let a,
        ali,
        ok = true;
    for(let i = 0; i < MODEL.actor_list.length; i++) {
      ali = MODEL.actor_list[i];
      a = MODEL.actors[ali[0]];
      // Rename actor if name has been changed
      if(a.displayName != ali[1]) a.rename(ali[1]);
      // Set its round flags
      a.round_flags = ali[2];
      // Double-check: parse expression if weight has been changed
      if(a.weight.text != ali[3]) {
        xp.expr = ali[3];
        xp.compile();
        if(xp.error) {
          UI.warningInvalidWeightExpression(a, xp.error);
          ok = false;
        } else {
          a.weight.update(xp);
        }
      }
      // Update import/export status
      MODEL.ioUpdate(a, ali[4]);
    }
    const seq = this.sequence.value;
    if(this.checkRoundSequence(seq) === false) ok = false;
    if(ok) {
      MODEL.round_sequence = seq;
      MODEL.rounds = this.rounds;
      UI.modals.actors.hide();
    }
  }
  
  showActorInfo(n, shift) {
    // Show actor documentation when Shift is held down
    // NOTE: do not allow documentation of "(no actor)"
    if(n > 0) {
      const a = MODEL.actorByID(MODEL.actor_list[n][0]);
      DOCUMENTATION_MANAGER.update(a, shift);
    }
  }
  
} // END of class ActorManager


// CLASS ConstraintEditor
class ConstraintEditor {
  constructor() {
    this.dialog = document.getElementById('constraint-dlg');
    this.from_name = document.getElementById('ce-from-name');
    this.to_name = document.getElementById('ce-to-name');
    this.bl_type = document.getElementById('bl-type');
    this.bl_selectors = document.getElementById('bl-selectors');
    this.soc_direct = document.getElementById('ce-soc-direct');
    this.soc = document.getElementById('ce-share-of-cost');
    this.soc_div = document.getElementById('ce-soc');
    // Make GUI elements responsive
    UI.modals.constraint.dialog.addEventListener('mousemove',
        () => DOCUMENTATION_MANAGER.update(
            CONSTRAINT_EDITOR.edited_constraint, true));
    UI.modals.constraint.cancel.addEventListener('click',
        () => UI.modals.constraint.hide());
    UI.modals.constraint.ok.addEventListener('click',
        () => CONSTRAINT_EDITOR.updateConstraint());
    this.container = document.getElementById('ce-container');
    this.container.addEventListener('mousemove',
        (event) => CONSTRAINT_EDITOR.mouseMove(event));
    this.container.addEventListener('mousedown',
        () => CONSTRAINT_EDITOR.mouseDown());
    this.container.addEventListener('mouseup',
        () => CONSTRAINT_EDITOR.mouseUp());
    // NOTE: interpret leaving the area as a mouse-up so that dragging ceases
    this.container.addEventListener('mouseleave',
        () => CONSTRAINT_EDITOR.mouseUp());
    this.pos_x_div = document.getElementById('ce-pos-x');
    this.pos_y_div = document.getElementById('ce-pos-y');
    this.point_div = document.getElementById('ce-point');
    this.equation_div = document.getElementById('ce-equation');
    this.add_point_btn = document.getElementById('add-point-btn');
    this.add_point_btn.addEventListener('click',
        () => CONSTRAINT_EDITOR.addPointToLine());
    this.del_point_btn = document.getElementById('del-point-btn');
    this.del_point_btn.addEventListener('click',
        () => CONSTRAINT_EDITOR.deletePointFromLine());
    this.add_bl_btn = document.getElementById('add-bl-btn');
    this.add_bl_btn.addEventListener('click',
        () => CONSTRAINT_EDITOR.addBoundLine());
    this.bl_type.addEventListener('change',
        () => CONSTRAINT_EDITOR.changeLineType());
    this.bl_selectors.addEventListener('blur',
        () => CONSTRAINT_EDITOR.changeLineSelectors());
    this.soc.addEventListener('blur',
        () => CONSTRAINT_EDITOR.changeShareOfCost());
    this.delete_bl_btn = document.getElementById('del-bl-btn');
    this.delete_bl_btn.addEventListener('click',
        () => CONSTRAINT_EDITOR.deleteBoundLine());
    // The chart is stored as an SVG string
    this.svg = '';
    // Scale, origin X and Y assume a 300x300 px square chart area
    this.scale = 3;
    this.oX = 25;
    this.oY = 315;
    // 0 => silver, LE => orange/red, GE => cyan/blue, EQ => purple
    this.line_color = ['#a0a0a0', '#c04000', '#0040c0', '#9000a0'];
    // Use brighter shades if selected (darker for gray) 
    this.selected_color = ['#808080', '#ff8040', '#00ffff', '#a800ff'];
    // The selected bound line object (NULL => no line selected)
    this.selected = null;
    // Cursor position in chart coordinates (100 x 100 grid)
    this.pos_x = 0;
    this.pos_y = 0;
    // `on_line`: the first bound line object detected under the cursor
    this.on_line = null;
    // `on_point`: index of point under the cursor
    this.on_point = -1;
    this.dragged_point = -1;
    this.selected_point = -1;
    this.cursor = 'default';
    // Properties for tracking which constraint is being edited
    this.edited_constraint = null;
    this.from_node = null;
    this.to_node = null;
    // The constraint object being edited (new instance, or copy of edited_constraint)
    this.constraint = null;
    // NOTE: all edits will be ignored unless the modeler clicks OK
  }
  
  mouseMove(e) {
    // The onMouseMove response of the constraint editor's graph area
    // Calculate cursor point without restricting it to 100x100 grid
    const
        rect = this.container.getBoundingClientRect(),
        top = rect.top + window.scrollY + document.body.scrollTop, 
        left = rect.left + window.scrollX + document.body.scrollLeft,
        x = Math.floor(e.clientX - left - this.oX) / this.scale,
        y = 100 - Math.floor(e.clientY - top - (this.oY - 100*this.scale)) / this.scale;
    // Limit X and Y so that they will always display between 0 and 100
    this.pos_x = Math.min(100, Math.max(0, x));
    this.pos_y = Math.min(100, Math.max(0, y));
    this.updateStatus();
    if(this.dragged_point >= 0) {
      this.movePoint();
    } else {
      this.checkLines();
    }
  }
  
  mouseDown() {
    // The onMouseDown response of the constraint editor's graph area
    if(this.adding_point) {
      this.doAddPointToLine();
    } else if(this.on_line) {
      this.selectBoundLine(this.on_line);
      this.dragged_point = this.on_point;
      this.selected_point = this.on_point;
    } else {
      this.selected = null;
      this.dragged_point = -1;
      this.selected_point = -1;
    }
    this.draw();
  }
  
  mouseUp() {
    // The onMouseUp response of the constraint editor's graph area
    this.dragged_point = -1;
    this.container.style.cursor = this.cursor;
    this.updateStatus();
  }
  
  updateCursor() {
    // Updates cursor shape in accordance with current state
    if(this.dragged_point >= 0 || this.on_point >= 0) {
      this.cursor = 'move';
    } else if(this.adding_point) {
      if(this.pos_x === 0 || this.pos_x === 100) {
        this.cursor = 'not-allowed';
      } else {
        this.cursor = 'crosshair';
      }
    } else if(this.on_line) {
      this.cursor = 'pointer';
    } else {
      this.cursor = 'default';
    }
    this.container.style.cursor = this.cursor;
  }
  
  arrowKey(k) {
    if(this.selected && this.selected_point >= 0) {
      const
          i = this.selected_point,
          pts = this.selected.points,
          li = pts.length - 1,
          p = pts[this.selected_point],
          minx = (i === 0 ? 0 : (i === li ? 100 : pts[i - 1][0])),
          maxx = (i === 0 ? 0 : (i === li ? 100 : pts[i + 1][0]));
      if(k === 37) {
        p[0] = Math.max(minx, p[0] - 1/3);
      } else if (k === 38 && p[1] <= 299/3) {
        p[1] += 1/3;
      } else if (k === 39) {
        p[0] = Math.min(maxx, p[0] + 1/3);
      } else if (k === 40 && p[1] >= 1/3) {
        p[1] -= 1/3;
      }
      // NOTE: compensate for small numerical errors
      p[0] = Math.round(3 * p[0]) / 3; 
      p[1] = Math.round(3 * p[1]) / 3; 
      this.draw();
      this.updateEquation();
    }
  }
  
  point(x, y) {
    // Returns a string denoting the point (x, y) in SVG notation, assuming
    // that x and y are mathematical coordinates (y-axis pointing UP) and
    // scaled to the constraint editor chart area, cf. global constants
    // defined for the constraint editor.
    return (this.oX + x * this.scale) + ',' + (this.oY - y * this.scale);
  }
  
  circleCenter(x, y) {
    // Similar to cePoint above, but prefixing the coordinates to conform
    // to SVG notation for a circle center
    return `cx="${this.oX + x * this.scale}" cy="${this.oY - y * this.scale}"`;
  }
  
  selectBoundLine(l) {
    // Selects bound line `l` and move it to end of list so it will be drawn
    // last and hence on top of all other bound lines (if any) 
    this.selected = l;
    const li = this.constraint.bound_lines.indexOf(l);
    if(li < this.constraint.bound_lines.length - 1) {
      this.constraint.bound_lines.splice(li, 1);
      this.constraint.bound_lines.push(l);
    }
  }
  
  addBoundLine() {
    // Adds a new lower bound line to the set
    this.selected = this.constraint.addBoundLine();
    this.selected_point = -1;
    this.adding_point = false;
    this.updateStatus();
    this.draw();
  }

  deleteBoundLine() {
    // Removes selected boundline from the set
    if(this.selected) {
      this.constraint.deleteBoundLine(this.selected);
      this.selected = null;
      this.adding_point = false;
      this.updateStatus();
      this.draw();
    }
  }
  
  addPointToLine() {
    // Prepares to add point on next "mouse down" event
    if(this.selected) {
      this.add_point_btn.classList.add('activ');
      this.adding_point = true;
      this.selected_point = -1;
      this.draw();
    }
  }
  
  doAddPointToLine() {
    // Actually add point to selected line
    if(!this.selected) return;
    const
        p = [this.pos_x, this.pos_y],
        lp = this.selected.points;
    let i = 0;
    while(i < lp.length && lp[i][0] < p[0]) i++;
    lp.splice(i, 0, p);
    this.selected_point = i;
    this.dragged_point = i;
    this.draw();
    // this.dragging_point = new point index! 
    this.add_point_btn.classList.remove('activ');
    this.adding_point = false;
  }
  
  deletePointFromLine() {
    // Deletes selected point from selected line (unless first or last point)
    if(this.selected && this.selected_point > 0 &&
        this.selected_point < this.selected.points.length - 1) {
      this.selected.points.splice(this.selected_point, 1);
      this.selected_point = -1;
      this.draw();
    }
  }
    
  changeLineType() {
    // Changes type of selected boundline
    if(this.selected) {
      this.selected.type = parseInt(this.bl_type.value);
      this.draw();
    }
  }
  
  changeLineSelectors() {
    // Changes experiment run selectors of selected boundline
    if(this.selected) {
      const sel = this.bl_selectors.value.replace(
          /[\;\,]/g, ' ').trim().replace(
          /[^a-zA-Z0-9\+\-\%\_\s]/g, '').split(/\s+/).join(' ');
      this.selected.selectors = sel;
      this.bl_selectors.value = sel;
      this.draw();
    }
  }
  
  changeShareOfCost() {
    // Validates input of share-of-cost field
    const soc = UI.validNumericInput('ce-share-of-cost', 'share of cost');
    if(soc === false) return;
    if(soc < 0 || soc > 100) {
      this.soc.focus();
      UI.warn('Share of cost can range from 0% to 100%');
      return;
    }
    // NOTE: share of cost is input as a percentage, but stored as a floating
    // point value between 0 and 1
    this.constraint.share_of_cost = soc / 100;
  }
  
  checkLines() {
    // Checks whether cursor is on a bound line and updates the constraint
    // editor status accordingly
    this.on_line = null;
    this.on_point = -1;
    this.seg_points = null;
    // Iterate over all lower bound lines (start with last one added)
    for(let i = this.constraint.bound_lines.length - 1;
        i >= 0 && !this.on_line; i--) {
      const l = this.constraint.bound_lines[i];
      for(let j = 0; j < l.points.length; j++) {
        const
            p = l.points[j],
            dsq = Math.pow(p[0] - this.pos_x, 2) + Math.pow(p[1] - this.pos_y, 2);
        if(dsq < 3) {
          this.on_point = j;
          this.on_line = l;
          this.seg_points = (j > 0 ? [j - 1, j] : [j, j + 1]);
          break;
        } else if(j > 0) {
          this.seg_points = [j - 1, j];
          const pp = l.points[j - 1];
          if(this.pos_x > pp[0] - 1 && this.pos_x < p[0] + 1 &&
              ((this.pos_y > pp[1] - 1 && this.pos_y < p[1] + 1) ||
               (this.pos_y < pp[1] + 1 && this.pos_y > p[1] + 1))) {
            // Cursor lies within rectangle around line segment
            const
                dx = p[0] - pp[0],
                dy = p[1] - pp[1];
            if(Math.abs(dx) < 1 || Math.abs(dy) < 1) {
              // Special case: (near) vertical or (near) horizontal line
              this.on_line = l;
              break;
            } else {
              const
                  dpx = this.pos_x - pp[0],
                  dpy = this.pos_y - pp[1],
                  dxol = Math.abs(pp[0] + dpy * dx / dy - this.pos_x),
                  dyol = Math.abs(pp[1] + dpx * dy / dx - this.pos_y);
              if (Math.min(dxol, dyol) < 1) {
                this.on_line = l;
                break;
              }
            }
          }
        }
      }
    }
    this.updateEquation();
    this.updateCursor();
  }
  
  updateEquation() {
    var segeq = '';
    if(this.on_line && this.seg_points) {
      const
          p1 = this.on_line.points[this.seg_points[0]],
          p2 = this.on_line.points[this.seg_points[1]],
          dx = p2[0] - p1[0],
          dy = p2[1] - p1[1];
      if(dx === 0) {
        segeq = 'X = ' + p1[0].toPrecision(3);
      } else if(dy === 0) {
        segeq = 'Y = ' + p1[1].toPrecision(3);
      } else {
        const
            slope = (dy === dx ? '' :
                (dy === -dx ? '-' : (dy / dx).toPrecision(3) + ' ')),
            y0 = p2[1] - p2[0] * dy / dx;
        segeq = `Y = ${slope}X` + (y0 === 0 ? '' :
            (y0 < 0 ? ' - ' : ' + ') + Math.abs(y0).toPrecision(3));
      }
    }
    this.equation_div.innerHTML = segeq;
  }

  movePoint() {
    // Moves the dragged point of the selected bound line
    // Use l as shorthand for the selected line
    const
        l = this.selected,
        pi = this.dragged_point,
        lpi = l.points.length - 1;
    // Check -- just in case
    if(!l || pi < 0 || pi > lpi) return;
    let p = l.points[pi],
        px = p[0],
        py = p[1],
        minx = (pi === 0 ? 0 : (pi === lpi ? 100 : l.points[pi - 1][0])),
        maxx = (pi === 0 ? 0 : (pi === lpi ? 100 : l.points[pi + 1][0])),
        newx = Math.min(maxx, Math.max(minx, this.pos_x)),
        newy = Math.min(100, Math.max(0, this.pos_y));
    // No action needed unless point has been moved 
    if(newx !== px || newy !== py) {
      p[0] = newx;
      p[1] = newy;
      this.draw();
      this.updateEquation();
    }
  }

  updateStatus() {    
    // Displays cursor position as X and Y (in chart coordinates), and updates
    // controls
    this.pos_x_div.innerHTML = 'X = ' + this.pos_x.toPrecision(3);
    this.pos_y_div.innerHTML = 'Y = ' + this.pos_y.toPrecision(3);
    const blbtns = 'add-point del-bl';
    if(this.selected) {
      if(this.selected_point >= 0) {
        const p = this.selected.points[this.selected_point];
        this.point_div.innerHTML =
            `(${p[0].toPrecision(3)}, ${p[1].toPrecision(3)})`;
      } else {
        this.point_div.innerHTML = '';
      }
      // Check whether selected point is an end point
      const ep = this.selected_point === 0 ||
          this.selected_point === this.selected.points.length - 1;
      // If so, do not allow deletion
      UI.enableButtons(blbtns + (ep ? '' : ' del-point'));
      if(this.adding_point) this.add_point_btn.classList.add('activ');
      this.bl_type.value = this.selected.type;
      this.bl_type.style.color = 'black';
      this.bl_type.disabled = false;
      this.bl_selectors.value = this.selected.selectors;
      this.bl_selectors.style.backgroundColor = 'white';
      this.bl_selectors.disabled = false;
    } else {
      UI.disableButtons(blbtns + ' del-point');
      this.bl_type.value = VM.EQ;
      this.bl_type.style.color = 'silver';
      this.bl_type.disabled = true;
      this.bl_selectors.value = '';
      this.bl_selectors.style.backgroundColor = 'inherit';
      this.bl_selectors.disabled = true;
    }
  }

  addSVG(lines) {
    // Appends a string or an array of strings to the SVG
    this.svg += (lines instanceof Array ? lines.join('') : lines);
  }
  
  draw() {
    // Draws the chart with bound lines and infeasible regions
    // NOTE: since this graph is relatively small, SVG is added as an XML string
    this.svg = ['<svg height="330" version="1.1" width="340"',
      ' xmlns="http://www.w3.org/2000/svg"',
      ' xmlns:xlink="http://www.w3.org/1999/xlink"',
      ' style="overflow: hidden; position: relative;">',
      '<defs>',
      // Fill patterns for infeasible areas differ per bound line type;
      // diagonal for LE and GE, horizontal for EQ, and when selected
      // in the constraint editor, different colors as well (orange,
      // blue or purple)
      '<pattern id="stroke1" x="2" y="2" width="4" height="4"',
      ' patternUnits="userSpaceOnUse"><path d="M0,0L4,4"',
      ' style="stroke: #400000; stroke-width: 0.5"></pattern>',
      '<pattern id="stroke1s" x="2" y="2" width="4" height="4"',
      ' patternUnits="userSpaceOnUse"><path d="M0,0L4,4"',
      ' style="stroke: #f04000; stroke-width: 0.5"></pattern>',
      '<pattern id="stroke2" x="2" y="2" width="4" height="4"',
      ' patternUnits="userSpaceOnUse"><path d="M4,0L0,4"',
      ' style="stroke: #000040; stroke-width: 0.5"></pattern>',
      '<pattern id="stroke2s" x="2" y="2" width="4" height="4"',
      ' patternUnits="userSpaceOnUse"><path d="M4,0L0,4"',
      ' style="stroke: #00a0ff; stroke-width: 0.5"></pattern>',
      '<pattern id="stroke3" x="2" y="2" width="4" height="4"',
      ' patternUnits="userSpaceOnUse"><path d="M0,2L4,2"',
      ' style="stroke: #180030; stroke-width: 0.5"></pattern>',
      '<pattern id="stroke3s" x="2" y="2" width="4" height="4"',
      ' patternUnits="userSpaceOnUse"><path d="M0,2L4,2"',
      ' style="stroke: #c060ff; stroke-width: 0.5"></pattern>',
      '</defs>'].join('');
    // Draw the grid
    this.drawGrid();
    // Use c as shorthand for this.constraint
    const c = this.constraint;
    // Add the SVG for lower and upper bounds
    for(let i = 0; i < c.bound_lines.length; i++) {
      const bl = c.bound_lines[i];
      this.drawContour(bl);
      this.drawLine(bl);
    }
    this.highlightSelectedPoint();
    // Add the SVG disclaimer
    this.addSVG('Sorry, your browser does not support inline SVG.</svg>');
    // Insert the SVG into the designated DIV
    this.container.innerHTML = this.svg;
    this.updateStatus();
  }

  drawGrid() {
    // Draw the grid area
    const hw = 100 * this.scale;
    this.addSVG(['<rect x="', this.oX, '" y="', this.oY - hw,
      '" width="', hw, '" height="', hw,
      '" fill="white" stroke="gray" stroke-width="1.5"></rect>']);
    // NOTES:
    // (1) font name fixed to Arial on purpose to preserve the look of
    //     this dialog
    // (2) d = distance between grid lines, l = left, r = right, t = top,
    //     b = bottom, tx = end of right-aligned numbers along vertical axis,
    //     ty = middle for numbers along the horizontal axis
    const d = 10 * this.scale, l = this.oX + 1, r = this.oX + hw - 1,
          t = this.oY - hw + 1, b = this.oY - 1,
          tx = this.oX - 3, ty = this.oY + 12;
    // Draw the dashed grid lines and their numbers 10 - 90 along both axes
    for(let i = 1; i < 10; i++) {
      const x = i*d + this.oX, y = this.oY - i*d, n = 10*i;
      this.addSVG(['<path fill="none" stroke="silver" d="M',
        x, ',', t, 'L', x, ',', b,
        '" stroke-width="0.5" stroke-dasharray="5,2.5"></path>',
        '<path fill="none" stroke="silver" d="M', l, ',', y, 'L', r, ',', y,
        '" stroke-width="0.5" stroke-dasharray="5,2.5"></path>',
        '<text x="', x, '" y="', ty,
        '" text-anchor="middle" font-family="Arial"',
        ' font-size="10px" stroke="none" fill="black">', n, '</text>',
        '<text x="', tx, '" y="', y + 4,
        '" text-anchor="end" font-family="Arial"',
        ' font-size="10px" stroke="none" fill="black">', n, '</text>']);
    }
    // also draw scale extremes (0 and 2x 100)
    this.addSVG(['<text x="', tx, '" y="', ty, '" text-anchor="end"',
      ' font-family="Arial" font-size="10px" stroke="none" fill="black">',
      '0</text><text x="', r,'" y="', ty, '" text-anchor="middle"',
      ' font-family="Arial" font-size="10px" stroke="none" fill="black">',
      '100</text><text x="', tx, '" y="', t, '" text-anchor="end"',
      ' font-family="Arial" font-size="10px" stroke="none" fill="black">',
      '100</text>']);
  }
  
  drawContour(l) {
    // Draws infeasible area for bound line `l`
    let cp;
    if(l.type === VM.EQ) {
      // Whole area is infeasible except for the bound line itself
      cp = ['M', this.point(0, 0), 'L', this.point(100 ,0), 'L',
          this.point(100, 100), 'L', this.point(0, 100), 'z'].join('');
    } else {
      const base_y = (l.type === VM.GE ? 0 : 100);
      cp = 'M' + this.point(0, base_y);
      for(let i = 0; i < l.points.length; i++) {
        const p = l.points[i];
        cp += `L${this.point(p[0], p[1])}`;
      }
      cp += 'L' + this.point(100, base_y) + 'z';
    }
    // Save the contour for rapid display of thumbnails
    l.contour_path = cp;
    // NOTE: the selected bound lines have their infeasible area filled
    // with a *colored* line pattern
    const sel = l === this.selected;
    this.addSVG(['<path fill="url(#stroke', l.type,
        (sel ? 's' : ''), ')" d="', cp, '" stroke="none" opacity="',
        (sel ? 1 : 0.4), '"></path>']);
  }
  
  drawLine(l) {
    let color,
        width,
        pp = [],
        dots = '';
    if(l == this.selected) {
      width = 3;
      color = this.selected_color[l.type];
    } else {
      width = 1.5;
      color = this.line_color[l.type];
    }
    const cfs = `fill="${color}" stroke="${color}" stroke-width="${width}"`;
    for(let i = 0; i < l.points.length; i++) {
      const
          px = l.points[i][0],
          py = l.points[i][1];
      pp.push(this.point(px, py));
      dots += `<circle ${this.circleCenter(px, py)} r="3" ${cfs}></circle>`;
    }
    const cp = 'M' + pp.join('L');
    // For EQ bound lines, the line path is the contour; this will be
    // drawn in miniature black against a silver background
    if(l.type === VM.EQ) l.contour_path = cp;
    this.addSVG(['<path fill="none" stroke="', color, '" d="', cp,
      '" stroke-width="', width, '"></path>', dots]);
  }

  highlightSelectedPoint() {
    if(this.selected && this.selected_point >= 0) {
      const p = this.selected.points[this.selected_point];
      this.addSVG(['<circle ', this.circleCenter(p[0], p[1]),
          ' r="4.5" fill="none" stroke="black" stroke-width="2px"></circle>']);
    }
  }
  
  showDialog() {
    this.from_node = MODEL.objectByName(this.from_name.innerHTML);
    this.to_node = MODEL.objectByName(this.to_name.innerHTML);
    // Double-check that these nodes exist
    if(!(this.from_node && this.to_node)) {
      throw 'ERROR: Unknown constraint node(s)';
    }
    // See if existing constraint is edited
    this.edited_constraint = this.from_node.doesConstrain(this.to_node);
    if(this.edited_constraint) {
      // Make a working copy, as the constraint must be changed only when
      // dialog OK is clicked. NOTE: use the GET property "copy", NOT the
      // Javascript function copy() !! 
      this.constraint = this.edited_constraint.copy;
    } else {
      // Create a new constraint
      this.constraint = new Constraint(this.from_node, this.to_node);
    }
    this.selected = null;
    // Draw the graph
    this.draw();
    // Allow modeler to omit slack variables for this constraint
    // NOTE: this could be expanded to apply to the selected BL only
    UI.setBox('ce-no-slack', this.constraint.no_slack);
    // NOTE: share of cost can only be transferred between two processes
    if(true||this.from_node instanceof Process && this.from_node instanceof Process) {
      this.soc_direct.value = this.constraint.soc_direction;
      // NOTE: share of cost is input as a percentage
      this.soc.value = VM.sig4Dig(100 * this.constraint.share_of_cost);
      this.soc_div.style.display = 'block';
    } else {
      this.soc_direct.value = VM.SOC_X_Y;
      this.soc.value = '0';
      this.soc_div.style.display = 'none';
    }
    UI.modals.constraint.show();
  }

  updateConstraint() {
    // Updates the edited constraint, or adds a new constraint to the model
    // TO DO: prepare for undo
    if(this.edited_constraint === null) {
      this.edited_constraint = MODEL.addConstraint(this.from_node, this.to_node);
    }
    // Copy properties of the "working copy" to the edited/new constraint
    // except for the comments (as these cannot be added/modified while the
    // constraint editor is visible)
    const cmnts = this.edited_constraint.comments;
    this.edited_constraint.copyPropertiesFrom(this.constraint);
    this.edited_constraint.comments = cmnts;
    // Set the "no slack" property based on the checkbox state
    this.edited_constraint.no_slack = UI.boxChecked('ce-no-slack');
    // Set the SoC direction property based on the selected option
    this.edited_constraint.soc_direction = parseInt(this.soc_direct.value);
    UI.paper.drawConstraint(this.edited_constraint);
    UI.modals.constraint.hide();
  }

} // END of class ConstraintEditor


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

//
// Draggable & resizable dialogs
//

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
        'click', () => REPOSITORY_BROWSER.loadModuleAsModel());
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
    // Adds repository if name is unique and valid
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
    // Removes selected repository from list
    // NOTE: do not remove the first item (local host)
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
    // Opens "Add repository" dialog
    this.add_modal.element('name').value = '';
    this.add_modal.element('url').value = '';
    this.add_modal.element('token').value = '';
    this.add_modal.show('name');
  }

  registerRepository() {
    // Checks whether URL defines a Linny-R repository, and if so, adds it
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
          this.loadModuleAsModel();
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


// CLASS GUIDatasetManager provides the dataset dialog functionality
class GUIDatasetManager extends DatasetManager {
  constructor() {
    super();
    this.dialog = UI.draggableDialog('dataset');
    UI.resizableDialog('dataset', 'DATASET_MANAGER');
    // Make toolbar buttons responsive
    this.close_btn = document.getElementById('dataset-close-btn');
    this.close_btn.addEventListener(
        'click', (event) => UI.toggleDialog(event));
    document.getElementById('ds-new-btn').addEventListener(
        'click', () => DATASET_MANAGER.promptForDataset());
    document.getElementById('ds-data-btn').addEventListener(
        'click', () => DATASET_MANAGER.editData());
    document.getElementById('ds-rename-btn').addEventListener(
        'click', () => DATASET_MANAGER.promptForName());
    document.getElementById('ds-clone-btn').addEventListener(
        'click', () => DATASET_MANAGER.cloneDataset());
    document.getElementById('ds-delete-btn').addEventListener(
        'click', () => DATASET_MANAGER.deleteDataset());
    document.getElementById('ds-filter-btn').addEventListener(
        'click', () => DATASET_MANAGER.toggleFilter());
    // Update when filter input text changes 
    this.filter_text = document.getElementById('ds-filter-text');
    this.filter_text.addEventListener(
        'input', () => DATASET_MANAGER.changeFilter());
    this.table = document.getElementById('dataset-table');
    // Data properties pane
    this.properties = document.getElementById('dataset-properties');
    // Toggle buttons at bottom of dialog
    this.blackbox = document.getElementById('dataset-blackbox');
    this.blackbox.addEventListener(
        'click', () => DATASET_MANAGER.toggleBlackBox());
    this.outcome = document.getElementById('dataset-outcome');
    this.outcome.addEventListener(
        'click', () => DATASET_MANAGER.toggleOutcome());
    this.io_box = document.getElementById('dataset-io');
    this.io_box.addEventListener(
        'click', () => DATASET_MANAGER.toggleImportExport());
    // Modifier pane buttons
    document.getElementById('ds-add-modif-btn').addEventListener(
        'click', () => DATASET_MANAGER.promptForSelector('new'));
    document.getElementById('ds-rename-modif-btn').addEventListener(
        'click', () => DATASET_MANAGER.promptForSelector('rename'));
    document.getElementById('ds-edit-modif-btn').addEventListener(
        'click', () => DATASET_MANAGER.editExpression());
    document.getElementById('ds-delete-modif-btn').addEventListener(
        'click', () => DATASET_MANAGER.deleteModifier());
    // Modal dialogs
    this.new_modal = new ModalDialog('new-dataset');
    this.new_modal.ok.addEventListener(
        'click', () => DATASET_MANAGER.newDataset());
    this.new_modal.cancel.addEventListener(
        'click', () => DATASET_MANAGER.new_modal.hide());
    this.rename_modal = new ModalDialog('rename-dataset');
    this.rename_modal.ok.addEventListener(
        'click', () => DATASET_MANAGER.renameDataset());
    this.rename_modal.cancel.addEventListener(
        'click', () => DATASET_MANAGER.rename_modal.hide());
    this.new_selector_modal = new ModalDialog('new-selector');
    this.new_selector_modal.ok.addEventListener(
        'click', () => DATASET_MANAGER.newModifier());
    this.new_selector_modal.cancel.addEventListener(
        'click', () => DATASET_MANAGER.new_selector_modal.hide());
    this.rename_selector_modal = new ModalDialog('rename-selector');
    this.rename_selector_modal.ok.addEventListener(
        'click', () => DATASET_MANAGER.renameModifier());
    this.rename_selector_modal.cancel.addEventListener(
        'click', () => DATASET_MANAGER.rename_selector_modal.hide());
    // The dataset time series dialog has more controls
    this.series_modal = new ModalDialog('series');
    this.series_modal.ok.addEventListener(
        'click', () => DATASET_MANAGER.saveSeriesData());
    this.series_modal.cancel.addEventListener(
        'click', () => DATASET_MANAGER.series_modal.hide());
    // Time-related controls must not be shown when array box is checked
    // NOTE: use timeout to permit checkbox to update its status first
    this.series_modal.element('array').addEventListener(
        'click', () => setTimeout(() => UI.toggle('series-no-time-msg'), 0));
    // When URL is entered, data is fetched from this URL
    this.series_modal.element('url').addEventListener(
        'blur', (event) => DATASET_MANAGER.getRemoteDataset(event.target.value));
    // The series data text area must update its status line
    this.series_data = this.series_modal.element('data');
    this.series_data.addEventListener(
        'keyup', () => DATASET_MANAGER.updateLine());
    this.series_data.addEventListener(
        'click', () => DATASET_MANAGER.updateLine());
    this.reset();
  }

  reset() {
    super.reset();
    this.selected_modifier = null;
    this.edited_expression = null;
    this.filter_pattern = null;
    this.last_time_selected = 0;
  }
  
  updateDialog() {
    const
        dl = [],
        dnl = [],
        sd = this.selected_dataset,
        ioclass = ['', 'import', 'export'];
    for(let d in MODEL.datasets) if(MODEL.datasets.hasOwnProperty(d) &&
        // NOTE: do not list "black-boxed" entities
        !d.startsWith(UI.BLACK_BOX) &&
        // NOTE: do not list the equations dataset
        MODEL.datasets[d] !== MODEL.equations_dataset) {
      if(!this.filter_pattern || this.filter_pattern.length === 0 ||
          patternMatch(MODEL.datasets[d].displayName, this.filter_pattern)) {
        dnl.push(d);
      }
    }
    dnl.sort();
    let sdid = 'dstr';
    for(let i = 0; i < dnl.length; i++) {
      const d = MODEL.datasets[dnl[i]];
      let cls = ioclass[MODEL.ioType(d)];
      if(d.outcome) {
        cls = (cls + ' outcome').trim();
      } else if(d.array) {
        cls = (cls + ' array').trim();
      }
      if(d.black_box) cls = (cls + ' blackbox').trim();
      if(cls) cls = ' class="'+ cls + '"';
      if(d === sd) sdid += i;
      dl.push(['<tr id="dstr', i, '" class="dataset',
          (d === sd ? ' sel-set' : ''),
          '" onclick="DATASET_MANAGER.selectDataset(event, \'',
          dnl[i], '\');" onmouseover="DATASET_MANAGER.showInfo(\'', dnl[i],
          '\', event.shiftKey);"><td', cls, '>', d.displayName,
          '</td></tr>'].join(''));
    }
    this.table.innerHTML = dl.join('');
    const btns = 'ds-data ds-rename ds-clone ds-delete';
    if(sd) {
      this.table.innerHTML = dl.join('');
      this.properties.style.display = 'block';
      document.getElementById('dataset-default').innerHTML =
          VM.sig4Dig(sd.default_value);
      document.getElementById('dataset-count').innerHTML = sd.data.length;
      document.getElementById('dataset-special').innerHTML = sd.propertiesString;
      if(sd.data.length > 0) {
        document.getElementById('dataset-min').innerHTML = VM.sig4Dig(sd.min);
        document.getElementById('dataset-max').innerHTML = VM.sig4Dig(sd.max);
        document.getElementById('dataset-mean').innerHTML = VM.sig4Dig(sd.mean);
        document.getElementById('dataset-stdev').innerHTML =
            VM.sig4Dig(sd.standard_deviation);
        document.getElementById('dataset-stats').style.display = 'block';
      } else {
        document.getElementById('dataset-stats').style.display = 'none';
      }
      if(sd.black_box) {
        this.blackbox.classList.remove('off');
        this.blackbox.classList.add('on');
      } else {
        this.blackbox.classList.remove('on');
        this.blackbox.classList.add('off');
      }
      if(sd.outcome) {
        this.outcome.classList.remove('not-selected');
      } else {
        this.outcome.classList.add('not-selected');
      }
      UI.setImportExportBox('dataset', MODEL.ioType(sd));
      const e = document.getElementById(sdid);
      UI.scrollIntoView(e);
      UI.enableButtons(btns);
    } else {
      this.properties.style.display = 'none';
      UI.disableButtons(btns);
    }
    this.updateModifiers();
  }
  
  updateModifiers() {
    const
        sd = this.selected_dataset,
        hdr = document.getElementById('dataset-modif-header'),
        name = document.getElementById('dataset-modif-ds-name'),
        ttls = document.getElementById('dataset-modif-titles'),
        mbtns = document.getElementById('dataset-modif-buttons'),
        msa = document.getElementById('dataset-modif-scroll-area');
    if(!sd) {
      hdr.innerText = '(no dataset selected)';
      name.style.display = 'none';
      ttls.style.display = 'none';
      msa.style.display = 'none';
      mbtns.style.display = 'none';
      return;
    }
    hdr.innerText = 'Modifiers of';
    name.innerHTML = sd.displayName;
    name.style.display = 'block';
    const
        ml = [],
        msl = sd.selectorList,
        sm = this.selected_modifier;
    let smid = 'dsmtr';
    for(let i = 0; i < msl.length; i++) {
      const
          m = sd.modifiers[UI.nameToID(msl[i])],
          defsel = (m.selector === sd.default_selector),
          clk = '" onclick="DATASET_MANAGER.selectModifier(event, \'' +
              m.selector + '\'';
      if(m === sm) smid += i;
      ml.push(['<tr id="dsmtr', i, '" class="dataset-modif',
          (m === sm ? ' sel-set' : ''),
          '"><td class="dataset-selector',
          (m.hasWildcards ? ' wildcard' : ''),
          '" title="Shift-click to ', (defsel ? 'clear' : 'set as'),
          ' default modifier',
          clk, ', false);">',
          (defsel ? '<img src="images/solve.png" style="height: 14px;' +
              ' width: 14px; margin: 0 1px -3px -1px;">' : ''),
          m.selector, '</td><td class="dataset-expression',
          clk, ');">', m.expression.text, '</td></tr>'].join(''));
    }
    document.getElementById('dataset-modif-table').innerHTML = ml.join('');
    ttls.style.display = 'block';
    msa.style.display = 'block';
    mbtns.style.display = 'block';
    if(sm) UI.scrollIntoView(document.getElementById(smid));
    const btns = 'ds-rename-modif ds-edit-modif ds-delete-modif';
    if(sm) {
      UI.enableButtons(btns);
    } else {
      UI.disableButtons(btns);
    }
  }
  
  showInfo(id, shift) {
    // Display documentation for the dataset having identifier `id`
    const d = MODEL.datasets[id];
    if(d) DOCUMENTATION_MANAGER.update(d, shift);
  }
  
  toggleFilter() {
    const
        btn = document.getElementById('ds-filter-btn'),
        bar = document.getElementById('ds-filter-bar'),
        dsa = document.getElementById('dataset-scroll-area');
    if(btn.classList.toggle('stay-activ')) {
      bar.style.display = 'block';
      dsa.style.top = '81px';
      dsa.style.height = 'calc(100% - 141px)';
      this.changeFilter();
    } else {
      bar.style.display = 'none';
      dsa.style.top = '62px';
      dsa.style.height = 'calc(100% - 122px)';
      this.filter_pattern = null; 
      this.updateDialog();
    }
  }
  
  changeFilter() {
    this.filter_pattern = patternList(this.filter_text.value);
    this.updateDialog();
  }
  
  selectDataset(event, id) {
    // Select dataset, or edit it when Alt- or double-clicked
    const
        d = MODEL.datasets[id] || null,
        now = Date.now(),
        dt = now - this.last_time_selected,
        // Consider click to be "double" if it occurred less than 300 ms ago
        edit = event.altKey || (d === this.selected_dataset && dt < 300);
    this.selected_dataset = d;
    this.last_time_selected = now;
    if(d && edit) {
      this.last_time_selected = 0;
      this.editData();
      return;
    }
    this.updateDialog();
  }
  
  selectModifier(event, id, x=true) {
    // Select modifier, or when double-clicked, edit its expression or the
    // name of the modifier
    if(this.selected_dataset) {
      const m = this.selected_dataset.modifiers[UI.nameToID(id)],
            now = Date.now(),
            dt = now - this.last_time_selected,
            // NOTE: Alt-click and double-click indicate: edit
            // Consider click to be "double" if the same modifier was clicked
            // less than 300 ms ago
            edit = event.altKey || (m === this.selected_modifier && dt < 300);
      this.last_time_selected = now;
      if(event.shiftKey) {
        // Toggle dataset default selector
        if(m.selector === this.selected_dataset.default_selector) {
          this.selected_dataset.default_selector = '';
        } else {
          this.selected_dataset.default_selector = m.selector;
        }
      }
      this.selected_modifier = m;
      if(edit) {
        this.last_time_selected = 0;
        if(x) {
          this.editExpression();
        } else {
          this.promptForSelector('rename');
        }
        return;
      }
    } else {
      this.selected_modifier = null;
    }
    this.updateModifiers();
  }
  
  promptForDataset() {
    this.new_modal.element('name').value = '';
    this.new_modal.show('name');
  }
  
  newDataset() {
    const n = this.new_modal.element('name').value.trim(),
          d = MODEL.addDataset(n);
    if(d) {
      this.new_modal.hide();
      this.selected_dataset = d;
      this.updateDialog();
    }
  }
  
  promptForName() {
    // Prompts the modeler for a new name for the selected dataset (if any)
    if(this.selected_dataset) {
      this.rename_modal.element('name').value =
          this.selected_dataset.displayName;
      this.rename_modal.show('name');
    }
  }
  
  renameDataset() {
    // Changes the name of the selected dataset
    if(this.selected_dataset) {
      const
          inp = this.rename_modal.element('name'),
          n = UI.cleanName(inp.value);
      // Show modeler the "cleaned" new name
      inp.value = n;
      // Then try to rename -- this may generate a warning
      if(this.selected_dataset.rename(n)) {
        this.rename_modal.hide();
        this.updateDialog();
        // Also update Chart manager and Experiment viewer, as these may
        // display a variable name for this dataset
        CHART_MANAGER.updateDialog();
        if(EXPERIMENT_MANAGER.selected_experiment) {
          EXPERIMENT_MANAGER.selected_experiment.inferVariables();
        }
        EXPERIMENT_MANAGER.updateDialog();
      }
    }
  }

  cloneDataset() {
    // Create a new dataset that is identical to the current one
    if(this.selected_dataset) {
      const d = this.selected_dataset;
      let nn = d.name + '-copy';
      while(MODEL.objectByName(nn)) {
        nn += '-copy';
      }
      const nd = MODEL.addDataset(nn);
      // Copy properties of d to nd
      nd.comments = `${d.comments}`;
      nd.default_value = d.default_value;
      nd.time_scale = d.time_scale;
      nd.time_unit = d.time_unit;
      nd.method = d.method;
      nd.periodic = d.periodic;
      nd.outcome = d.outcome;
      nd.array = d.array;
      nd.url = d.url;
      nd.data = d.data.slice();
      for(let s in d.modifiers) if(d.modifiers.hasOwnProperty(s)) {
        const
            m = d.modifiers[s],
            nm = nd.addModifier(m.selector);
        nm.expression = new Expression(nd, s, m.expression.text);
      }
      nd.resetExpressions();
      nd.computeStatistics();
      this.selected_dataset = nd;
      this.updateDialog();
    }    
  }

  deleteDataset() {
    const d = this.selected_dataset;
    // Double-check, just in case...
    if(d && d !== MODEL.equations_dataset) {
      MODEL.removeImport(d);
      MODEL.removeExport(d);
      delete MODEL.datasets[d.identifier];
      this.selected_dataset = null;
      this.updateDialog();
      MODEL.updateDimensions();      
    }
  }
  
  toggleBlackBox() {
    const d = this.selected_dataset;
    if(d) {
      d.black_box = !d.black_box;
      this.updateDialog();
    }
  }
  
  toggleOutcome() {
    const d = this.selected_dataset;
    if(d) {
      // NOTE: arrays cannot be outcomes
      if(d.array) {
        d.outcome = false;
      } else {
        d.outcome = !d.outcome;
      }
      this.updateDialog();
      if(!UI.hidden('experiment-dlg')) EXPERIMENT_MANAGER.updateDialog();
    }
  }
  
  toggleImportExport() {
    const d = this.selected_dataset;
    if(d) {
      MODEL.ioUpdate(d, (MODEL.ioType(d) + 1) % 3);
      this.updateDialog();
    }
  }
  
  promptForSelector(dlg) {
    let ms = '',
        md = this.new_selector_modal;
    if(dlg === 'rename') {
      if(this.selected_modifier) ms = this.selected_modifier.selector;
      md = this.rename_selector_modal;
    }
    md.element('name').value = ms;
    md.show('name');
  }

  newModifier() {
    const
        sel = this.new_selector_modal.element('name').value,
        m = this.selected_dataset.addModifier(sel);
    if(m) {
      this.selected_modifier = m;
      // NOTE: update dimensions only if dataset now has 2 or more modifiers
      // (ignoring those with wildcards)
      const sl = this.selected_dataset.plainSelectors;
      if(sl.length > 1) MODEL.expandDimension(sl);
      this.new_selector_modal.hide();
      this.updateModifiers();
    }
  }
  
  renameModifier() {
    if(!this.selected_modifier) return;
    const
        hw = this.selected_modifier.hasWildcards,
        sel = this.rename_selector_modal.element('name').value,
        // Keep track of old name
        oldm = this.selected_modifier,
        // NOTE: addModifier returns existing one if selector not changed
        m = this.selected_dataset.addModifier(sel);
    // NULL can result when new name is invalid
    if(!m) return;
    // If selected modifier was the dataset default selector, update it
    if(oldm.selector === this.selected_dataset.default_selector) {
      this.selected_dataset.default_selector = m.selector;
    }
    // If only case has changed, just update the selector
    // NOTE: normal dataset selector, so remove all invalid characters
    if(m === oldm) {
      m.selector = sel.replace(/[^a-zA-z0-9\%\+\-]/g, '');
      this.updateDialog();
      return;
    }
    // Rest is needed only when a new modifier has been added
    m.expression = oldm.expression;
    if(hw) {
      // Wildcard selector means: recompile the modifier expression
      m.expression.attribute = m.selector;
      m.expression.compile();
    }
    this.deleteModifier();
    this.selected_modifier = m;
    // Update all chartvariables referencing this dataset + old selector
    let cv_cnt = 0;
    for(let i = 0; i < MODEL.charts.length; i++) {
      const c = MODEL.charts[i];
      for(let j = 0; j < c.variables.length; j++) {
        const v = c.variables[j];
        if(v.object === this.selected_dataset &&
            v.attribute === oldm.selector) {
          v.attribute = m.selector;
          cv_cnt++;
        }
      }
    }
    // Also replace old selector in all expressions (count these as well)
    const xr_cnt = MODEL.replaceAttributeInExpressions(
        oldm.dataset.name + '|' + oldm.selector, m.selector);
    // Notify modeler of changes (if any)
    const msg = [];
    if(cv_cnt) msg.push(pluralS(cv_cnt, ' chart variable'));
    if(xr_cnt) msg.push(pluralS(xr_cnt, ' expression variable'));
    if(msg.length) {
      UI.notify('Updated ' +  msg.join(' and '));
      // Also update these stay-on-top dialogs, as they may display a
      // variable name for this dataset + modifier 
      CHART_MANAGER.updateDialog();
      DATASET_MANAGER.updateDialog();
      EQUATION_MANAGER.updateDialog();
      EXPERIMENT_MANAGER.updateDialog();
      FINDER.changeFilter();
    }
    // NOTE: update dimensions only if dataset now has 2 or more modifiers
    // (ignoring those with wildcards)
    const sl = this.selected_dataset.plainSelectors;
    if(sl.length > 1) MODEL.expandDimension(sl);
    this.rename_selector_modal.hide();
    this.updateModifiers();
  }
  
  editExpression() {
    const m = this.selected_modifier;
    if(m) {
      this.edited_expression = m.expression;
      const md = UI.modals.expression;
      md.element('property').innerHTML = this.selected_dataset.displayName +
          UI.OA_SEPARATOR + m.selector;
      md.element('text').value = m.expression.text;
      document.getElementById('variable-obj').value = 0;
      X_EDIT.updateVariableBar();
      X_EDIT.clearStatusBar();
      md.show('text');
    }
  }

  modifyExpression(x) {
    // Update and compile expression only if it has been changed
    if (x != this.edited_expression.text) {
      this.edited_expression.text = x;
      this.edited_expression.compile();
    }
    this.edited_expression.reset();
    this.edited_expression = null;
    this.updateModifiers();
  }

  deleteModifier() {
    // Delete modifier from selected dataset
    const m = this.selected_modifier;
    if(m) {
      // If it was the dataset default modifier, clear the default
      if(m.selector === this.selected_dataset.default_selector) {
        this.selected_dataset.default_selector = '';
      }
      // Then simply remove the object
      delete this.selected_dataset.modifiers[UI.nameToID(m.selector)];
      this.selected_modifier = null;
      this.updateModifiers();
      MODEL.updateDimensions();
    }
  }

  updateLine() {
    const
        ln =  document.getElementById('series-line-number'),
        lc =  document.getElementById('series-line-count');
    ln.innerHTML = this.series_data.value.substr(0,
        this.series_data.selectionStart).split('\n').length;
    lc.innerHTML = this.series_data.value.split('\n').length;
  }
  
  editData() {
    // Show the Edit time series dialog
    const
        ds = this.selected_dataset,
        md = this.series_modal,
        cover = md.element('no-time-msg');
    if(ds) {
      md.element('default').value = ds.default_value;
      cover.style.display = (ds.array ? 'block' : 'none');
      md.element('time-scale').value = VM.sig4Dig(ds.time_scale);
      // Add options for time unit selector
      const ol = [];
      for(let u in VM.time_unit_shorthand) {
        if(VM.time_unit_shorthand.hasOwnProperty(u)) {
          ol.push(['<option value="', u,
              (u === ds.time_unit ? '" selected="selected' : ''),
              '">', VM.time_unit_shorthand[u], '</option>'].join(''));
        }
      }
      md.element('time-unit').innerHTML = ol.join('');
      // Add options for(dis)aggregation method selector
      ol.length = 0;
      for(let i = 0; i < this.methods.length; i++) {
        ol.push(['<option value="', this.methods[i],
            (this.methods[i] === ds.method ? '" selected="selected' : ''),
            '">', this.method_names[i], '</option>'].join(''));
      }
      md.element('method').innerHTML = ol.join('');
      // Update the "periodic" box
      UI.setBox('series-periodic', ds.periodic);
      // Update the "array" box
      UI.setBox('series-array', ds.array);
      md.element('url').value = ds.url;
      // Show data as decimal numbers (JS default notation) on separate lines
      this.series_data.value = ds.data.join('\n');
      md.show('default');
    }
  }
  
  saveSeriesData() {
    const ds = this.selected_dataset;
    if(!ds) return false;
    const dv = UI.validNumericInput('series-default', 'default value');
    if(dv === false) return false;
    const ts = UI.validNumericInput('series-time-scale', 'time scale');
    if(ts === false) return false;
    // NOTE: Trim textarea value as it typically has trailing newlines
    let lines = this.series_data.value.trim();
    if(lines) {
      lines = lines.split('\n');
    } else {
      lines = [];
    }
    let n,
        data = [];
    for(let i = 0; i < lines.length; i++) {
      // consider comma's to denote the decimal period
      const txt = lines[i].trim().replace(',', '.');
      // consider blank lines as "no data" => replace by default value
      if(txt === '') {
        n = dv;
      } else {
        n = parseFloat(txt);
        if(isNaN(n) || '0123456789'.indexOf(txt[txt.length - 1]) < 0) {
          UI.warn(`Invalid number "${txt}" at line ${i + 1}`);
          return false;
        }
      }
      data.push(n);
    }
    // Save the data
    ds.default_value = dv;
    ds.time_scale = ts;
    ds.time_unit = this.series_modal.element('time-unit').value;
    ds.method = this.series_modal.element('method').value;
    ds.periodic = UI.boxChecked('series-periodic');
    ds.array = UI.boxChecked('series-array');
    if(ds.array) ds.outcome = false;
    ds.url = this.series_modal.element('url').value;
    ds.data = data;
    ds.computeVector();
    ds.computeStatistics();
    if(ds.data.length === 0 && !ds.array &&
        Object.keys(ds.modifiers).length > 0 &&
        ds.timeStepDuration !== MODEL.timeStepDuration) {
      UI.notify('Dataset time scale only affects time series data; ' +
          'modifier expressions evaluate at model time scale');
    }
    this.series_modal.hide();
    this.updateDialog();
  }
  
} // END of class GUIDatasetManager


// CLASS EquationManager provides the equation dialog functionality
class EquationManager {
  constructor() {
    this.dialog = UI.draggableDialog('equation');
    UI.resizableDialog('equation', 'EQUATION_MANAGER');    
    this.close_btn = document.getElementById('equation-close-btn');
    this.close_btn.addEventListener(
        'click', (event) => UI.toggleDialog(event));
    this.table = document.getElementById('equation-table');
    this.scroll_area = document.getElementById('equation-scroll-area');
    
    // Make toolbar buttons responsive
    document.getElementById('eq-new-btn').addEventListener(
        'click', () => EQUATION_MANAGER.promptForEquation());
    document.getElementById('eq-rename-btn').addEventListener(
        'click', () => EQUATION_MANAGER.promptForName());
    document.getElementById('eq-edit-btn').addEventListener(
        'click', () => EQUATION_MANAGER.editEquation());
    document.getElementById('eq-delete-btn').addEventListener(
        'click', () => EQUATION_MANAGER.deleteEquation());
    
    // Create modal dialogs
    this.new_modal = new ModalDialog('new-equation');
    this.new_modal.ok.addEventListener(
        'click', () => EQUATION_MANAGER.newEquation());
    this.new_modal.cancel.addEventListener(
        'click', () => EQUATION_MANAGER.cancelEquation());

    this.rename_modal = new ModalDialog('rename-equation');
    this.rename_modal.ok.addEventListener(
        'click', () => EQUATION_MANAGER.renameEquation());
    this.rename_modal.cancel.addEventListener(
        'click', () => EQUATION_MANAGER.rename_modal.hide());

    // Initialize the dialog properties
    this.reset();
  }

  reset() {
    this.visible = false;
    this.selected_modifier = null;
    this.edited_expression = null;
    this.last_time_selected = 0;
  }
  
  updateDialog() {
    // Updates equation list, highlighting selected equation (if any)
    const
        ed = MODEL.equations_dataset,
        ml = [],
        msl = ed.selectorList,
        sm = this.selected_modifier;
    let smid = 'eqmtr';
    for(let i = 0; i < msl.length; i++) {
      const
          m = ed.modifiers[UI.nameToID(msl[i])],
          mp = (m.parameters ? '\\' + m.parameters.join('\\') : ''),
          clk = '" onclick="EQUATION_MANAGER.selectModifier(event, \'' +
              m.selector + '\'';
      if(m === sm) smid += i;
      ml.push(['<tr id="eqmtr', i, '" class="dataset-modif',
          (m === sm ? ' sel-set' : ''),
          '"><td class="equation-selector',
          (m.expression.isStatic ? '' : ' it'),
          clk, ', false);">',
          m.selector, mp, '</td><td class="equation-expression',
          clk, ');">', m.expression.text, '</td></tr>'].join(''));
    }
    this.table.innerHTML = ml.join('');
    this.scroll_area.style.display = 'block';
    if(sm) UI.scrollIntoView(document.getElementById(smid));
    const btns = 'eq-rename eq-edit eq-delete';
    if(sm) {
      UI.enableButtons(btns);
    } else {
      UI.disableButtons(btns);
    }
  }
  
  showInfo(id, shift) {
    // @@TO DO: Display documentation for the equation => extra comments field?
  }
  
  selectModifier(event, id, x=true) {
    // Select modifier, or when Alt- or double-clicked, edit its expression
    // or the equation name (= name of the modifier)
    if(MODEL.equations_dataset) {
      const
          m = MODEL.equations_dataset.modifiers[UI.nameToID(id)] || null,
          now = Date.now(),
          dt = now - this.last_time_selected,
          // Consider click to be "double" if it occurred less than 300 ms ago
          edit = event.altKey || (m === this.selected_modifier && dt < 300);
      this.last_time_selected = now;
      this.selected_modifier = m;
      if(m && edit) {
        this.last_time_selected = 0;
        if(x) {
          this.editEquation();
        } else {
          this.promptForName();
        }
        return;
      }
    } else {
      this.selected_modifier = null;
    }
    this.updateDialog();
  }
  
  promptForEquation(add=false) {
    this.add_to_chart = add;
    this.new_modal.element('name').value = '';
    this.new_modal.show('name');
  }
  
  newEquation() {
    const
        n = this.new_modal.element('name').value.trim(),
        m = MODEL.equations_dataset.addModifier(n);
    if(m) {
      this.new_modal.hide();
      this.selected_modifier = m;
      this.updateDialog();
      // Open expression editor if expression is still undefined
      if(!m.expression.text) this.editEquation();
    }
  }

  editEquation() {
    const m = this.selected_modifier;
    if(m) {
      this.edited_expression = m.expression;
      const md = UI.modals.expression;
      md.element('property').innerHTML = this.selected_modifier.selector;
      md.element('text').value = m.expression.text;
      document.getElementById('variable-obj').value = 0;
      X_EDIT.updateVariableBar();
      X_EDIT.clearStatusBar();
      md.show('text');
    }
  }
  
  cancelEquation() {
    this.new_modal.hide();
    this.add_to_chart = false;
  }

  modifyEquation(x) {
    // Update and compile expression only if it has been changed
    if(this.edited_expression && x != this.edited_expression.text) {
      this.edited_expression.text = x;
      this.edited_expression.compile();
    }
    this.edited_expression.reset();
    this.edited_expression = null;
    this.updateDialog();
    CHART_MANAGER.updateDialog();
    if(this.add_to_chart && CHART_MANAGER.chart_index >= 0) {
      // Add selected modifier as new equation to chart
      CHART_MANAGER.addVariable(this.selected_modifier.selector);
      this.add_to_chart = false;
    }
  }

  promptForName() {
    // Prompts the modeler for a new name for the selected equation (if any)
    if(this.selected_modifier) {
      this.rename_modal.element('name').value = this.selected_modifier.selector;
      this.rename_modal.show('name');
    }
  }
  
  renameEquation() {
    if(!this.selected_modifier) return;
    const
        sel = this.rename_modal.element('name').value,
        // Keep track of old name
        oldm = this.selected_modifier,
        olds = oldm.selector,
        // NOTE: addModifier returns existing one if selector not changed
        m = MODEL.equations_dataset.addModifier(sel);
    // NULL indicates invalid name
    if(!m) return;
    // If only case has changed, update the selector
    // NOTE: equation names may contain spaces; if so, reduce to single space
    if(m === oldm) {
      m.selector = sel.trim().replace(/\s+/g, ' ');
    } else {
      // When a new modifier has been added, more actions are needed
      m.expression = oldm.expression;
      m.parameters = oldm.parameters;
      this.deleteEquation();
      this.selected_modifier = m;
    }
    // Update all chartvariables referencing this dataset + old selector
    let cv_cnt = 0;
    for(let i = 0; i < MODEL.charts.length; i++) {
      const c = MODEL.charts[i];
      for(let j = 0; j < c.variables.length; j++) {
        const v = c.variables[j];
        if(v.object === MODEL.equations_dataset &&
            v.attribute === olds) {
          v.attribute = m.selector;
          cv_cnt++;
        }
      }
    }
    // Also replace old selector in all expressions (count these as well)
    // NOTE: equation selectors in variables are similar to entity names
    const xr_cnt = MODEL.replaceEntityInExpressions(olds, m.selector);
    // Notify modeler of changes (if any)
    const msg = [];
    if(cv_cnt) msg.push(pluralS(cv_cnt, ' chart variable'));
    if(xr_cnt) msg.push(pluralS(xr_cnt, ' expression variable'));
    if(msg.length) {
      UI.notify('Updated ' +  msg.join(' and '));
      // Also update these stay-on-top dialogs, as they may display a
      // variable name for this dataset + modifier
      CHART_MANAGER.updateDialog();
      DATASET_MANAGER.updateDialog();
      EQUATION_MANAGER.updateDialog();
      EXPERIMENT_MANAGER.updateDialog();
      FINDER.changeFilter();
    }
    // Always close the name prompt dialog, and update the equation manager
    this.rename_modal.hide();
    this.updateDialog();
  }
  
  deleteEquation() {
    const m = this.selected_modifier;
    if(m) {
      delete MODEL.equations_dataset.modifiers[UI.nameToID(m.selector)];
      this.selected_modifier = null;
      this.updateDialog();
    }
  }

} // END of class EquationManager


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
    document.getElementById('chart-delete-variable-btn').addEventListener(
        'click', () => CHART_MANAGER.deleteVariable());
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
    document.getElementById('chart-toggle-chevron').addEventListener(
        'click', () => CHART_MANAGER.toggleControlPanel());
    document.getElementById('chart-stats-btn').addEventListener(
        'click', () => CHART_MANAGER.toggleStatistics());
    document.getElementById('chart-copy-stats-btn').addEventListener(
        'click', () => CHART_MANAGER.copyStatistics());
    document.getElementById('chart-copy-data-btn').addEventListener(
        'click', () => CHART_MANAGER.copyData());
    document.getElementById('chart-copy-table-btn').addEventListener(
        'click', () => CHART_MANAGER.copyTable());
    document.getElementById('chart-save-btn').addEventListener(
        'click', () => CHART_MANAGER.downloadChart());
    document.getElementById('chart-render-btn').addEventListener(
        'click', () => CHART_MANAGER.renderChartAsPNG());
    document.getElementById('chart-widen-btn').addEventListener(
        'click', () => CHART_MANAGER.stretchChart(1));
    document.getElementById('chart-narrow-btn').addEventListener(
        'click', () => CHART_MANAGER.stretchChart(-1));

    // The Add variable modal
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

    // The Edit variable modal
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
    // NOTE: uses the color picker developed by James Daniel
    this.color_picker = new iro.ColorPicker("#color-picker", {
        width: 92,
        height: 92,
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

    // The Rename chart modal
    this.rename_chart_modal = new ModalDialog('rename-chart');
    this.rename_chart_modal.ok.addEventListener(
        'click', () => CHART_MANAGER.renameChart());
    this.rename_chart_modal.cancel.addEventListener(
        'click', () => CHART_MANAGER.rename_chart_modal.hide());
    
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
    this.runs_chart = false;
    // Clear the model-related DOM elements
    this.chart_selector.innerHTML = '';
    this.variables_table.innerHTML = '';
    this.options_shown = true;
    this.setRunsChart(false);
    this.last_time_selected = 0;
  }
  
  setRunsChart(show) {
    // Indicates whether the chart manager should display a run result chart
    this.runs_chart = show;
    if(show) {
      this.results_btn.classList.add('stay-activ');
    } else {
      this.results_btn.classList.remove('stay-activ');
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
    if(!obj) {
      UI.alert(`Unknown entity ID "${n}"`);
    } else if(this.chart_index >= 0) {
      // Only accept when all conditions are met
      ev.preventDefault();
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
    // Adds one option to the selector for each chart defined for the model
    // NOTE: add the "new chart" option if still absent
    MODEL.addChart(this.new_chart_title);
    if(this.chart_index < 0) this.chart_index = 0;
    const ol = [];
    for(let i = 0; i < MODEL.charts.length; i++) {
      ol.push('<option value="', i,
        (i == this.chart_index ? '"selected="selected' : ''),
        '">', MODEL.charts[i].title , '</option>');
    }
    this.chart_selector.innerHTML = ol.join('');
  }
  
  updateDialog() {
    // Refreshes all dialog fields to display actual MODEL chart properties
    this.updateSelector();
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
      for(let i = 0; i < this.legend_options.length; i++) {
        const opt = this.legend_options[i], val = opt.toLowerCase();
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
          ');"></div></td><td class="v-name">', cv.displayName,
          '</td></tr>'].join(''));
      }
      this.variables_table.innerHTML = ol.join('');
    } else {
      this.variable_index = -1;
    }
    const
        u_btn = 'chart-variable-up ',
        d_btn = 'chart-variable-down ',
        ed_btns = 'chart-edit-variable chart-delete-variable ';
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
      // If the Edit variable dialog is showing, update its header
      if(this.variable_index >= 0 && !UI.hidden('variable-dlg')) {
        document.getElementById('variable-dlg-name').innerHTML =
            c.variables[this.variable_index].displayName;
      }
    }
    this.add_variable_modal.element('obj').value = 0;
    // Update variable dropdown list of the "add variable" modal
    X_EDIT.updateVariableBar('add-');
    this.stretchChart(0);
  }
  
  updateExperimentInfo() {
    // Display selected experiment title in dialog header if run data are used
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
          x = e.pageX -
              this.svg_container.getBoundingClientRect().left + window.scrollX;
      let n = '';
      if(c.histogram) {
        let vv = [];
        for(let i = 0; i < c.variables.length; i++) {
          if(c.variables[i].visible) vv.push(c.variables[i]);
        }
        const
            l = vv.length,
            bars = c.bins * l,
            b = Math.max(0, Math.min(bars, Math.floor(bars * (x - ox) / w))),
            v = vv[b % l],
            t = Math.floor(b / l);
        if(x > ox && b < bars) n = 'N = ' + v.bin_tallies[t];
      } else {
        const
            runs = EXPERIMENT_MANAGER.selectedRuns(c),
            p = c.total_time_steps,
            first = (runs.length > 0 ? 1 : MODEL.start_period),
            last = (runs.length > 0 ? p : MODEL.end_period),
            t = Math.round(first - 0.5 + p * (x - ox) / w);
        n = 't = ' + Math.max(0, Math.min(t, last));
      }
      this.time_step.innerHTML = n;
      this.time_step.style.display = 'block';
    } else {
      this.time_step.style.display = 'none';
    }
  }

  selectChart() {
    // Sets the selected chart to be the "active" chart
    const ci = parseInt(this.chart_selector.value);
    // Deselect variable only if different chart is selected
    if(ci !== this.chart_index) this.variable_index = -1;
    this.chart_index = ci;
    this.updateDialog();
  }

  promptForTitle() {
    // Prompts modeler for a new title for the current chart
    if(this.chart_index >= 0) {
      this.rename_chart_modal.show();
      const nct = document.getElementById('new-chart-title');
      nct.value = MODEL.charts[this.chart_index].displayName;
      nct.focus();
    }
  }

  renameChart() {
    // Renames the current chart
    if(this.chart_index >= 0) {
      const t = document.getElementById('new-chart-title').value.trim();
      // Check if a chart with this title already exists
      const ci = MODEL.indexOfChart(t);
      if(ci >= 0 && ci != this.chart_index) {
        UI.warn(`A chart with title "${t}" already exists`);
      } else {
        const c = MODEL.charts[this.chart_index];
        // Remember the old title of the chart-to-be-renamed
        const ot = c.title;
        c.title = t;
        // If the default '(new chart)' has been renamed, create a new one
        if(ot === this.new_chart_title) {
          MODEL.addChart(ot);
        }
        // Update the chart index so that it points to the renamed chart
        this.chart_index = MODEL.indexOfChart(t);
        this.updateSelector();
        // Redraw the chart if title is shown
        if(c.show_title) this.drawChart();
      }
      // Update experiment viewer in case its current experiment uses this chart
      EXPERIMENT_MANAGER.updateDialog();
      FINDER.changeFilter();
    }
    this.rename_chart_modal.hide();
  }
  
  cloneChart() {
    // Creates a new chart that is identical to the current one
    if(this.chart_index >= 0) {
      let c = MODEL.charts[this.chart_index],
          nt = c.title + '-copy';
      while(MODEL.indexOfChart(nt) >= 0) {
        nt += '-copy';
      }
      const nc = MODEL.addChart(nt);
      // Copy properties of c to nc
      nc.histogram = c.histogram;
      nc.bins = c.bins;
      nc.show_title = c.show_title;
      nc.legend_position = c.legend_position;
      for(let i = 0; i < c.variables.length; i++) {
        const
            cv = c.variables[i],
            nv = new ChartVariable(nc);
        nv.setProperties(cv.object, cv.attribute, cv.stacked,
            cv.color, cv.scale_factor, cv.line_width);
        nc.variables.push(nv);
      }
      this.chart_index = MODEL.indexOfChart(nc.title);
      this.updateDialog();
    }    
  }

  toggleRunResults() {
    // Toggles the Boolean property that signals charts that they must plot
    // run results if they are part of the selected experiment chart set
    this.setRunsChart(!this.runs_chart);
    this.resetChartVectors();
    this.updateDialog();
  }
  
  deleteChart() {
    // Deletes the shown chart (if any)
    if(this.chart_index >= 0) {
      // NOTE: do not delete the default chart, but clear it
      if(MODEL.charts[this.chart_index].title === this.new_chart_title) {
        MODEL.charts[this.chart_index].reset();
      } else {
        MODEL.charts.splice(this.chart_index, 1);
        this.chart_index = -1;
      }
      this.updateDialog();
      // Also update the experiment viewer (charts define the output variables)
      EXPERIMENT_MANAGER.updateDialog();
      FINDER.changeFilter();
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
    // Adds the variable specified by the add-variable-dialog to the chart
    // NOTE: when defined, `eq` is the selector of the equation to be added
    if(this.chart_index >= 0) {
      let o = '',
          a = eq;
      if(!eq) {
        o = this.add_variable_modal.selectedOption('name').text;
        a = this.add_variable_modal.selectedOption('attr').text;
      }
      // NOTE: when equation is added, object specifier is empty string
      if(!o && a) o = UI.EQUATIONS_DATASET_NAME;
      this.variable_index = MODEL.charts[this.chart_index].addVariable(o, a);
      if(this.variable_index >= 0) {
        this.add_variable_modal.hide();
        this.updateDialog();
        // Also update the experiment viewer (charts define the output variables)
        if(EXPERIMENT_MANAGER.selected_experiment) {
          EXPERIMENT_MANAGER.selected_experiment.inferVariables();
          EXPERIMENT_MANAGER.updateDialog();
        }
      }
    }
  }
  
  selectVariable(vi) {
    // Select variable, and edit it when double-clicked
    const
        now = Date.now(),
        dt = now - this.last_time_selected;
    if(vi >= 0 && this.chart_index >= 0) {
      this.last_time_selected = now;
      if(vi === this.variable_index) {
        // Consider click to be "double" if it occurred less than 300 ms ago
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
    
  editVariable() {
    // Shows the edit (or rather: format) variable dialog
    if(this.chart_index >= 0 && this.variable_index >= 0) {
      const cv = MODEL.charts[this.chart_index].variables[this.variable_index];
      document.getElementById('variable-dlg-name').innerHTML = cv.displayName;
      UI.setBox('variable-stacked', cv.stacked);
      this.variable_modal.element('scale').value = VM.sig4Dig(cv.scale_factor);
      this.variable_modal.element('width').value = VM.sig4Dig(cv.line_width);
      this.variable_modal.element('color').style.backgroundColor = cv.color;
      try {
        this.color_picker.color.hexString = cv.color;
      } catch(e) {
        this.color_picker.color.rgbString = cv.color;
      }
      // Show change equation buttons only for equation variables
      if(cv.object === MODEL.equations_dataset) {
        this.change_equation_btns.style.display = 'block';
      } else {
        this.change_equation_btns.style.display = 'none';
      }
      this.variable_modal.show();
    }
  }
  
  toggleVariable(vi) {
    window.event.stopPropagation();
    if(vi >= 0 && this.chart_index >= 0) {
      const cv = MODEL.charts[this.chart_index].variables[vi];
      // toggle visibility of the selected variable
      cv.visible = !cv.visible;
      // update the check box
      UI.setBox('v-box-' + vi, cv.visible);
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
      cv.stacked = UI.boxChecked('variable-stacked');
      cv.scale_factor = s;
      cv.line_width = w;
      cv.color = this.color_picker.color.hexString;
      // NOTE: clear the vector so it will be recalculated
      cv.vector.length = 0;
    }
    this.variable_modal.hide();
    this.updateDialog();
  }
  
  renameEquation() {
    // Renames the selected variable (if it is an equation)
    if(this.chart_index >= 0 && this.variable_index >= 0) {
      const v = MODEL.charts[this.chart_index].variables[this.variable_index];
      if(v.object === MODEL.equations_dataset) {
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
      if(v.object === MODEL.equations_dataset) {
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
      // and finder dialog
      if(EXPERIMENT_MANAGER.selected_experiment) {
        EXPERIMENT_MANAGER.updateDialog();
        FINDER.changeFilter();
      }
    }
    this.variable_modal.hide();
  }
  
  showChartImage(c) {
    // Displays the SVG image for chart `c` (computed by this Chart object)
    if(c) document.getElementById('chart-svg').innerHTML = c.svg;
  }

  drawTable() {
    // Shows the statistics on the chart variables
    const html = [];
    let vbl = [];
    if(this.chart_index >= 0) vbl = MODEL.charts[this.chart_index].variables;
    // First get the (potentially floating point) numbers so that their format
    // can be made uniform per column
    const data = [];
    let nr = 0;
    for(let i = 0; i < vbl.length; i++) {
      const v = vbl[i];
      if(v.visible) {
        data.push([VM.sig4Dig(v.minimum), VM.sig4Dig(v.maximum),
            VM.sig4Dig(v.mean), VM.sig4Dig(Math.sqrt(v.variance)),
            VM.sig4Dig(v.sum)]);
        nr++;
      }
    }
    if(nr == 0 || this.drawing_chart) {
      this.table_panel.html = '<div id="no-chart-data">No data</div>';
      return;
    }
    // Process each of 5 columns separately
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
    for(let i = 0; i < vbl.length; i++) {
      const v = vbl[i];
      if(v.visible) {
        // NOTE: while still solving, display t-1 as N
        const n = Math.max(0, v.N);
        html.push('<tr><td class="v-name">',
            [v.displayName, n, data[nr][0], data[nr][1], data[nr][2],
                data[nr][3], data[nr][4],
                v.non_zero_tally, v.exceptions].join('</td><td>'),
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
    if(this.stretch_factor === 1) {
      nbtn.classList.remove('enab');
      nbtn.classList.add('disab');
    } else if(this.stretch_factor === 2) {
      nbtn.classList.remove('disab');
      nbtn.classList.add('enab');
    } else if(this.stretch_factor === 9) {
      wbtn.classList.remove('disab');
      wbtn.classList.add('enab');
    } else if(this.stretch_factor === 10) {
      wbtn.classList.remove('enab');
      wbtn.classList.add('disab');
    }
  }
  
  copyTable() {
    UI.copyHtmlToClipboard(this.table_panel.innerHTML);
    UI.notify('Table copied to clipboard (as HTML)');
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
  
  downloadChart() {
    // Pushes the SVG of the selected chart as file to the browser
    if(this.chart_index >= 0) {
      FILE_MANAGER.pushOutSVG(MODEL.charts[this.chart_index].svg);
    }
  }
  
  renderChartAsPNG() {
    localStorage.removeItem('png-url');
    FILE_MANAGER.renderSVGAsPNG(MODEL.charts[this.chart_index].svg);
  }

  drawChart() {
    // Displays the selected chart unless an experiment is running, or already
    // busy with an earlier drawChart call
    if(MODEL.running_experiment) {
      UI.notify(UI.NOTICE.NO_CHARTS);
    } else if(this.chart_index >= 0 && !this.drawing_chart) {
      this.drawing_chart = true;
      CHART_MANAGER.actuallyDrawChart();
    } else {
      console.log(`Skipped drawing chart "${MODEL.charts[this.chart_index]}"`);
    }
  }
  
  actuallyDrawChart() {
    // Draws the chart, and resets the cursor when done
    MODEL.charts[this.chart_index].draw();
    this.drawing_chart = false;
    this.drawTable();
  }
  
} // END of class ChartManager


// CLASS GUISensitivityAnalysis implements the GUI for the parent class
// SensitivityAnalysis defined in file `linny-r-ctrl.js`
class GUISensitivityAnalysis extends SensitivityAnalysis {
  constructor() {
    super();
    this.dialog = UI.draggableDialog('sensitivity');
    UI.resizableDialog('sensitivity', 'SENSITIVITY_ANALYSIS');
    this.close_btn = document.getElementById('sensitivity-close-btn');
    this.close_btn.addEventListener('click', (e) => UI.toggleDialog(e));
    // Control panel accepts drag/drop of entities
    this.control_panel = document.getElementById('sensitivity-control-panel');
    this.control_panel.addEventListener(
        'dragover', (event) => SENSITIVITY_ANALYSIS.dragOver(event));
    this.control_panel.addEventListener(
        'drop', (event) => SENSITIVITY_ANALYSIS.handleDrop(event));
    this.base_selectors = document.getElementById('sa-base-selectors');
    this.base_selectors.addEventListener('mouseover',
        (event) => SENSITIVITY_ANALYSIS.showSelectorInfo(event.shiftKey));
    this.base_selectors.addEventListener(
        'focus', () => SENSITIVITY_ANALYSIS.editBaseSelectors());
    this.base_selectors.addEventListener(
        'blur', () => SENSITIVITY_ANALYSIS.setBaseSelectors());

    this.delta = document.getElementById('sa-delta');
    this.delta.addEventListener(
        'focus', () => SENSITIVITY_ANALYSIS.editDelta());
    this.delta.addEventListener(
        'blur', () => SENSITIVITY_ANALYSIS.setDelta());
    
    // NOTE: both the base selectors and the delta input blur on Enter  
    const blurf = (event) => { if(event.key === 'Enter') event.target.blur(); };
    this.base_selectors.addEventListener('keyup', blurf);
    this.delta.addEventListener('keyup', blurf);
    
    // Make parameter buttons responsive
    document.getElementById('sa-p-add-btn').addEventListener(
        'click', () => SENSITIVITY_ANALYSIS.promptForParameter());
    document.getElementById('sa-p-up-btn').addEventListener(
        'click', () => SENSITIVITY_ANALYSIS.moveParameter(-1));
    document.getElementById('sa-p-down-btn').addEventListener(
        'click', () => SENSITIVITY_ANALYSIS.moveParameter(1));
    document.getElementById('sa-p-delete-btn').addEventListener(
        'click', () => SENSITIVITY_ANALYSIS.deleteParameter());
    // Make outcome buttons responsive
    document.getElementById('sa-o-add-btn').addEventListener(
        'click', () => SENSITIVITY_ANALYSIS.promptForOutcome());
    document.getElementById('sa-o-up-btn').addEventListener(
        'click', () => SENSITIVITY_ANALYSIS.moveOutcome(-1));
    document.getElementById('sa-o-down-btn').addEventListener(
        'click', () => SENSITIVITY_ANALYSIS.moveOutcome(1));
    document.getElementById('sa-o-delete-btn').addEventListener(
        'click', () => SENSITIVITY_ANALYSIS.deleteOutcome());
    // The toggle button to hide/show the control panel
    this.toggle_chevron = document.getElementById('sa-toggle-chevron');
    this.toggle_chevron.addEventListener(
        'click', () => SENSITIVITY_ANALYSIS.toggleControlPanel());

    // The display panel and its buttons
    this.display_panel = document.getElementById('sensitivity-display-panel');
    this.start_btn = document.getElementById('sa-start-btn');
    this.start_btn.addEventListener(
        'click', () => SENSITIVITY_ANALYSIS.start());
    this.pause_btn = document.getElementById('sa-pause-btn');
    this.pause_btn.addEventListener(
        'click', () => SENSITIVITY_ANALYSIS.pause());
    this.stop_btn = document.getElementById('sa-stop-btn');
    this.stop_btn.addEventListener(
        'click', () => SENSITIVITY_ANALYSIS.stop());
    this.reset_btn = document.getElementById('sa-reset-btn');
    this.reset_btn.addEventListener(
        'click', () => SENSITIVITY_ANALYSIS.clearResults());
    this.progress = document.getElementById('sa-progress');
    this.statistic = document.getElementById('sensitivity-statistic');
    this.statistic.addEventListener(
        'change', () => SENSITIVITY_ANALYSIS.setStatistic());
    // Scroll area for the outcomes table
    this.scroll_area = document.getElementById('sa-scroll-area');
    this.scroll_area.addEventListener(
        'mouseover', (event) => SENSITIVITY_ANALYSIS.showOutcome(event, ''));
    this.table = document.getElementById('sa-table');
    // Buttons at panel bottom
    this.abs_rel_btn = document.getElementById('sa-abs-rel');
    this.abs_rel_btn.addEventListener(
        'click', () => SENSITIVITY_ANALYSIS.toggleAbsoluteRelative());
    this.color_scales = {
        rb: document.getElementById('sa-rb-scale'),
        no: document.getElementById('sa-no-scale')
      };
    const csf = (event) => SENSITIVITY_ANALYSIS.setColorScale(event);
    this.color_scales.rb.addEventListener('click', csf);
    this.color_scales.no.addEventListener('click', csf);
    document.getElementById('sa-copy-btn').addEventListener(
        'click', () => SENSITIVITY_ANALYSIS.copyTableToClipboard());
    document.getElementById('sa-copy-data-btn').addEventListener(
        'click', () => SENSITIVITY_ANALYSIS.copyDataToClipboard());
    this.outcome_name = document.getElementById('sa-outcome-name');

    // The add variable modal
    this.variable_modal = new ModalDialog('add-sa-variable');
    this.variable_modal.ok.addEventListener(
        'click', () => SENSITIVITY_ANALYSIS.addVariable());
    this.variable_modal.cancel.addEventListener(
        'click', () => SENSITIVITY_ANALYSIS.variable_modal.hide());
    // NOTE: the modal calls methods of the Expression Editor dialog
    this.variable_modal.element('obj').addEventListener(
      'change', () => X_EDIT.updateVariableBar('add-sa-'));
    this.variable_modal.element('name').addEventListener(
      'change', () => X_EDIT.updateAttributeSelector('add-sa-'));

    // Initialize main dialog properties
    this.reset();
  }

  updateDialog() {
    this.updateControlPanel();
    this.drawTable();
    this.color_scales[this.color_scale.range].classList.add('sel-cs');
  }
  
  updateControlPanel() {
    this.base_selectors.value = MODEL.base_case_selectors;
    this.delta.value = VM.sig4Dig(MODEL.sensitivity_delta);
    const tr = [];
    for(let i = 0; i < MODEL.sensitivity_parameters.length; i++) {
      const p = MODEL.sensitivity_parameters[i];
      tr.push('<tr class="dataset',
          (this.selected_parameter === i ? ' sel-set' : ''),
          '" onclick="SENSITIVITY_ANALYSIS.selectParameter(', i, ');">',
          '<td class="v-box"><div id="sap-box-', i, '" class="vbox',
          (this.checked_parameters[p] ? ' crossed' : ' clear'),
          '" onclick="SENSITIVITY_ANALYSIS.toggleParameter(', i,
          ');"></div></td><td>', p, '</td></tr>');
    }
    document.getElementById('sa-p-table').innerHTML = tr.join('');
    tr.length = 0;
    for(let i = 0; i < MODEL.sensitivity_outcomes.length; i++) {
      const o = MODEL.sensitivity_outcomes[i];
      tr.push('<tr class="dataset',
          (this.selected_outcome === i ? ' sel-set' : ''),
          '" onclick="SENSITIVITY_ANALYSIS.selectOutcome(', i, ');">',
          '<td class="v-box"><div id="sao-box-', i, '" class="vbox',
          (this.checked_outcomes[o] ? ' crossed' : ' clear'),
          '" onclick="SENSITIVITY_ANALYSIS.toggleOutcome(', i,
          ');"></div></td><td>', o, '</td></tr>');
    }
    document.getElementById('sa-o-table').innerHTML = tr.join('');
    this.updateControlButtons('p');
    this.updateControlButtons('o');
    // NOTE: allow run without parameters, but not without outcomes
    if(MODEL.sensitivity_outcomes.length > 0) {
      this.start_btn.classList.remove('disab');
      this.start_btn.classList.add('enab');
    } else {
      this.start_btn.classList.remove('enab');
      this.start_btn.classList.add('disab');
    }
    // Show the "clear results" button only when selected experiment has run
    if(MODEL.sensitivity_runs.length > 0) {
      this.reset_btn.classList.remove('off');
    } else {
      this.reset_btn.classList.add('off');
      this.progress.innerHTML = '';
    }
    this.variable_modal.element('obj').value = 0;
    // Update variable dropdown list of the "add SA variable" modal using
    // a method of the Expression Editor dialog
    X_EDIT.updateVariableBar('add-sa-');
  }

  updateControlButtons(b) {
    const
        up = document.getElementById(`sa-${b}-up-btn`),
        down = document.getElementById(`sa-${b}-down-btn`),
        del = document.getElementById(`sa-${b}-delete-btn`);
    let index, last;
    if(b === 'p') {
      index = this.selected_parameter;
      last = MODEL.sensitivity_parameters.length - 1;
    } else {
      index = this.selected_outcome;
      last = MODEL.sensitivity_outcomes.length - 1;
    }
    up.classList.add('v-disab');
    down.classList.add('v-disab');
    del.classList.add('v-disab');
    if(index >= 0) {
      del.classList.remove('v-disab');
      if(index > 0) up.classList.remove('v-disab');
      if(index < last) down.classList.remove('v-disab');
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
      this.display_panel.style.left = 'calc(40% + 2px)';
      this.display_panel.style.width = 'calc(60% - 5px)';
      this.toggle_chevron.innerHTML = '&laquo;';    
      this.toggle_chevron.title = 'Hide control panel';
      this.options_shown = true;
    }
  }

  showSelectorInfo(shift) {
    // Called when cursor is moved over the base selectors input field
    if(shift && MODEL.base_case_selectors.length > 0) {
      // When selector(s) are specified and shift is pressed, show info on
      // what the selectors constitute as base scenario
      this.showBaseCaseInfo();
      return;
    }
    // Otherwise, display list of all database selectors in docu-viewer
    if(DOCUMENTATION_MANAGER.visible) {
      const
          ds_dict = MODEL.listOfAllSelectors,
          html = [],
          sl = Object.keys(ds_dict).sort();
      for(let i = 0; i < sl.length; i++) {
        const
            s = sl[i],
            dl = ds_dict[s],
            dnl = [],
            bs = (dl.length > 1 ?
                ' style="border: 0.5px solid #a080c0; border-right: none"' : '');
        for(let j = 0; j < dl.length; j++) {
          dnl.push(dl[j].displayName);
        }
        html.push('<tr><td class="sa-ds-sel" ',
            'onclick="SENSITIVITY_ANALYSIS.toggleSelector(this);">',
            s, '</td><td', bs, '>', dnl.join('<br>'), '</td></tr>');
      }
      if(html.length > 0) {
        // Display information as read-only HTML
        DOCUMENTATION_MANAGER.title.innerText = 'Dataset selectors';
        DOCUMENTATION_MANAGER.viewer.innerHTML =
            '<table><tr><td><strong>Selector</strong></td>' +
            '<td><strong>Dataset(s)</strong><td></tr>' + html.join('') +
            '</table>';
        DOCUMENTATION_MANAGER.edit_btn.classList.remove('enab');
        DOCUMENTATION_MANAGER.edit_btn.classList.add('disab');
      }
    }
  }
  
  showBaseCaseInfo() {
    // Display information on the base case selectors combination if docu-viewer
    // is visible and cursor is moved over base case input field
    const combi = MODEL.base_case_selectors.split(' ');
    if(combi.length > 0 && DOCUMENTATION_MANAGER.visible) {
      const
          info = {},
          html = [],
          list = [];
      info.title = `Base scenario: <tt>${tupelString(combi)}</tt>`;
      for(let i = 0; i < combi.length; i++) {
        const sel = combi[i];
        html.push('<h3>Selector <tt>', sel, '</tt></h3>');
        // List associated datasets (if any)
        list.length = 0;
        for(let id in MODEL.datasets) if(MODEL.datasets.hasOwnProperty(id)) {
          const ds = MODEL.datasets[id];
          for(let k in ds.modifiers) if(ds.modifiers.hasOwnProperty(k)) {
            if(ds.modifiers[k].match(sel)) {
              list.push('<li>', MODEL.datasets[id].displayName,
                  '<span class="dsx">',
                  MODEL.datasets[id].modifiers[UI.nameToID(sel)].expression.text,
                  '</span></li>');
            }
          }
        }
        if(list.length > 0) {
          html.push('<em>Datasets:</em> <ul>', list.join(''), '</ul>');
        }
        info.html = html.join('');
        // Display information as read-only HTML
        DOCUMENTATION_MANAGER.title.innerHTML = info.title;
        DOCUMENTATION_MANAGER.viewer.innerHTML = info.html;
        DOCUMENTATION_MANAGER.edit_btn.classList.remove('enab');
        DOCUMENTATION_MANAGER.edit_btn.classList.add('disab');
      }
    }
  }
  
  toggleSelector(obj) {
    const
      sel = obj.textContent,
      bsl = MODEL.base_case_selectors.split(' '),
      index = bsl.indexOf(sel);
    if(index >= 0) {
      bsl.splice(index, 1);
    } else {
      bsl.push(sel);
    }
    MODEL.base_case_selectors = bsl.join(' ');
   this.base_selectors.value = MODEL.base_case_selectors;
  }
  
  editBaseSelectors() {
    // Give visual feedback by setting background color to white
    this.base_selectors.style.backgroundColor = 'white';
  }
  
  setBaseSelectors() {
    // Sanitize string before accepting it as space-separated selector list
    const
        sl = this.base_selectors.value.replace(/[\;\,]/g, ' ').trim().replace(
            /[^a-zA-Z0-9\+\-\%\_\s]/g, '').split(/\s+/),
        bs = sl.join(' '),
        sd = MODEL.listOfAllSelectors,
        us = [];
    for(let i = 0; i < sl.length; i++) {
      if(sl[i].length > 0 && !(sl[i] in sd)) us.push(sl[i]);
    }
    if(us.length > 0) {
      UI.warn('Base contains ' + pluralS(us.length, 'unknown selector') +
          ': "' + us.join('", "') + '"');
    } else if(MODEL.base_case_selectors !== bs &&
        MODEL.sensitivity_runs.length > 0) {
      UI.notify('Change may have invalidated the analysis results');
    }
    MODEL.base_case_selectors = bs;
    this.base_selectors.value = bs;
    this.base_selectors.style.backgroundColor = 'inherit';
  }
  
  editDelta() {
    // Give visual feedback by setting background color to white
    this.delta.backgroundColor = 'white';
  }
  
  setDelta() {
    const
        did = 'sensitivity-delta',
        d = UI.validNumericInput(did, 'Delta');
    if(d !== false) {
      if(MODEL.sensitivity_delta !== d && MODEL.sensitivity_runs.length > 0) {
        UI.notify('Change may have invalidated the analysis results');
      }
      MODEL.sensitivity_delta = d;
      document.getElementById(did).style.backgroundColor = 'inherit';
    }
    this.updateDialog();
  }
  
  selectParameter(p) {
    this.selected_parameter = p;
    this.updateControlPanel();
  }
  
  selectOutcome(o) {
    this.selected_outcome = o;
    this.updateControlPanel();
  }
  
  toggleParameter(n) {
    const p = MODEL.sensitivity_parameters[n];
    let c = false;
    if(p in this.checked_parameters) c = this.checked_parameters[p];
    this.checked_parameters[p] = !c;
    this.drawTable();
  }
  
  toggleOutcome(n) {
    const o = MODEL.sensitivity_outcomes[n];
    let c = false;
    if(o in this.checked_outcomes) c = this.checked_outcomes[o];
    this.checked_outcomes[o] = !c;
    this.drawTable();
  }

  moveParameter(dir) {
    let n = this.selected_parameter;
    if(n < 0) return;
    if(dir > 0 && n < MODEL.sensitivity_parameters.length - 1 ||
        dir < 0 && n > 0) {
      n += dir;
      const v = MODEL.sensitivity_parameters.splice(this.selected_parameter, 1)[0];
      MODEL.sensitivity_parameters.splice(n, 0, v);
      this.selected_parameter = n;
    }
    this.updateDialog();
  }
  
  moveOutcome(dir) {
    let n = this.selected_outcome;
    if(n < 0) return;
    if(dir > 0 && n < MODEL.sensitivity_outcomes.length - 1 ||
       dir < 0 && n > 0) {
      n += dir;
      const v = MODEL.sensitivity_outcomes.splice(this.selected_outcome, 1)[0];
      MODEL.sensitivity_outcomes.splice(n, 0, v);
      this.selected_outcome = n;
    }
    this.updateDialog();
  }
  
  promptForParameter() {
    // Open dialog for adding new parameter
    const md = this.variable_modal;
    md.element('type').innerText = 'parameter';
    // NOTE: clusters have no suitable attributes, and equations are endogenous
    md.element('cluster').style.display = 'none';
    md.element('equation').style.display = 'none';
    md.show();
  }

  promptForOutcome() {
    // Open dialog for adding new outcome
    const md = this.variable_modal;
    md.element('type').innerText = 'outcome';
    md.element('cluster').style.display = 'block';
    md.element('equation').style.display = 'block';
    md.show();
  }

  dragOver(ev) {
    const
        tid = ev.target.id,
        ok = (tid.startsWith('sa-p-') || tid.startsWith('sa-o-')),
        n = ev.dataTransfer.getData('text'),
        obj = MODEL.objectByID(n);
    if(ok && obj) ev.preventDefault();
  }
  
  handleDrop(ev) {
    // Prompt for attribute if dropped object is a suitable entity
    ev.preventDefault();
    const
        tid = ev.target.id,
        param = tid.startsWith('sa-p-'),
        n = ev.dataTransfer.getData('text'),
        obj = MODEL.objectByID(n);
    if(!obj) {
      UI.alert(`Unknown entity ID "${n}"`);
    } else if(param && obj instanceof Cluster) {
      UI.warn('Clusters do not have exogenous attributes');
    } else if(obj instanceof DatasetModifier) {
      if(param) {
        UI.warn('Equations can only be outcomes');
      } else {
        MODEL.sensitivity_outcomes.push(obj.displayName);
        this.updateDialog();    
      }
    } else {
      const vt = this.variable_modal.element('type');
      if(param) {
        vt.innerText = 'parameter';
      } else {
        vt.innerText = 'outcome';
      }
      this.variable_modal.show();
      const
          tn = VM.object_types.indexOf(obj.type),
          dn = obj.displayName;
      this.variable_modal.element('obj').value = tn;
      X_EDIT.updateVariableBar('add-sa-');
      const s = this.variable_modal.element('name');
      let i = 0;
      for(let k in s.options) if(s.options.hasOwnProperty(k)) {
        if(s[k].text === dn) {
          i = s[k].value;
          break;
        }
      }
      s.value = i;
      // NOTE: use method of the Expression Editor, specifying the SA prefix
      X_EDIT.updateAttributeSelector('add-sa-'); 
    }  
  }

  addVariable() {
    // Add parameter or outcome to the respective list
    const
        md = this.variable_modal,
        t = md.element('type').innerText,
        e = md.selectedOption('obj').text,
        o = md.selectedOption('name').text,
        a = md.selectedOption('attr').text;
    let n = '';
    if(e === 'Equation' && a) {
      n = a;
    } else if(o && a) {
      n = o + UI.OA_SEPARATOR + a;
    }
    if(n) {
      if(t === 'parameter' && MODEL.sensitivity_parameters.indexOf(n) < 0) {
        MODEL.sensitivity_parameters.push(n);
      } else if(t === 'outcome' && MODEL.sensitivity_outcomes.indexOf(n) < 0) {
        MODEL.sensitivity_outcomes.push(n);
      }
      this.updateDialog();
    }
    md.hide();
  }
  
  deleteParameter() {
    // Remove selected parameter from the analysis
    MODEL.sensitivity_parameters.splice(this.selected_parameter, 1);
    this.selected_parameter = -1;
    this.updateDialog();
  }

  deleteOutcome() {
    // Remove selected outcome from the analysis
    MODEL.sensitivity_outcomes.splice(this.selected_outcome, 1);
    this.selected_outcome = -1;
    this.updateDialog();
  }

  pause() {
    // Interrupt solver but retain data on server and allow resume
    UI.notify('Run sequence will be suspended after the current run');
    this.pause_btn.classList.add('blink');
    this.stop_btn.classList.remove('off');
    this.must_pause = true;
  }

  resumeButtons() {
    // Changes buttons to "running" state, and return TRUE if state was "paused"
    const paused = this.start_btn.classList.contains('blink');
    this.start_btn.classList.remove('blink');
    this.start_btn.classList.add('off');
    this.pause_btn.classList.remove('off');
    this.stop_btn.classList.add('off');
    return paused;
  }

  readyButtons() {
    // Sets experiment run control buttons in "ready" state
    this.pause_btn.classList.add('off');
    this.stop_btn.classList.add('off');
    this.start_btn.classList.remove('off', 'blink');
  }
  
  pausedButtons(aci) {
    // Sets experiment run control buttons in "paused" state
    this.pause_btn.classList.remove('blink');
    this.pause_btn.classList.add('off');
    this.start_btn.classList.remove('off');
    // Blinking start button indicates: paused -- click to resume
    this.start_btn.classList.add('blink');
    this.progress.innerHTML = `Run ${aci} PAUSED`;
  }
  
  clearResults() {
    // Clears results, and resets control buttons
    MODEL.sensitivity_runs.length = 0;
    this.readyButtons();
    this.reset_btn.classList.add('off');
    this.selected_run = -1;
    this.updateDialog();
  }

  setProgress(msg) {
    // Shows `msg` in the progress field of the dialog
    this.progress.innerHTML = msg;
  }
  
  showCheckmark(t) {
    // Shows green checkmark (with elapsed time `t` as title) in progress field
    this.progress.innerHTML =
        `<span class="x-checked" title="${t}">&#10004;</span>`;
  }

  drawTable() {
    // Draws sensitivity analysis as table
    const
        html = [],
        pl = MODEL.sensitivity_parameters.length,
        ol = MODEL.sensitivity_outcomes.length;
    if(ol === 0) {
      this.table.innerHTML = '';
      return;
    }
    html.push('<tr><td colspan="2"></td>');
    for(let i = 0; i < ol; i++) {
      const o = MODEL.sensitivity_outcomes[i];
      if(!this.checked_outcomes[o]) {
        html.push('<td class="sa-col-hdr" ',
            'onmouseover="SENSITIVITY_ANALYSIS.showOutcome(event, \'', o, '\');">',
            i+1, '</td>');
      }
    }
    html.push('</tr><tr class="sa-p-row" ',
        'onclick="SENSITIVITY_ANALYSIS.selectRun(0);">',
        '<td colspan="2" class="sa-row-hdr"><em>Base scenario</em></td>');
    for(let i = 0; i < ol; i++) {
      const o = MODEL.sensitivity_outcomes[i];
      if(!this.checked_outcomes[o]) {
        html.push('<td id="sa-r0c', i,
            '" onmouseover="SENSITIVITY_ANALYSIS.showOutcome(event, \'',
            o, '\');"></td>');
      }
    }
    html.push('</tr>');
    const
        sdelta = (MODEL.sensitivity_delta >= 0 ? '+' : '') +
            VM.sig4Dig(MODEL.sensitivity_delta) + '%',
        dc = sdelta.startsWith('+') ? 'sa-plus' : 'sa-minus';
    for(let i = 0; i < pl; i++) {
      const p = MODEL.sensitivity_parameters[i];
      if(!this.checked_parameters[p]) {
        html.push('<tr class="sa-p-row" ',
            'onclick="SENSITIVITY_ANALYSIS.selectRun(', i+1, ');">',
            '<td class="sa-row-hdr" title="', p, '">', p,
            '</td><td class="', dc, '">', sdelta, '</td>');
        for(let j = 0; j < MODEL.sensitivity_outcomes.length; j++) {
          const o = MODEL.sensitivity_outcomes[j];
          if(!this.checked_outcomes[o]) {
            html.push('<td id="sa-r', i+1, 'c', j,
                '" onmouseover="SENSITIVITY_ANALYSIS.showOutcome(event, \'',
                o, '\');"></td>');
          }
        }
      }
      html.push('</tr>');
    }
    this.table.innerHTML = html.join('');
    if(this.selected_run >= 0) document.getElementById(
          `sa-r${this.selected_run}c0`).parent().classList.add('sa-p-sel');
    this.updateData();
  }
  
  updateData() {
    // Fills table cells with their data value or status
    const
        pl = MODEL.sensitivity_parameters.length,
        ol = MODEL.sensitivity_outcomes.length,
        rl = MODEL.sensitivity_runs.length;
    if(ol === 0) return;
    // NOTE: computeData is a parent class method
    this.computeData(this.selected_statistic);
    // Draw per row (i) where i=0 is the base case
    for(let i = 0; i <= pl; i ++) {
      if(i < 1 || !this.checked_parameters[MODEL.sensitivity_parameters[i-1]]) {
        for(let j = 0; j < ol; j++) {
          if(!this.checked_outcomes[MODEL.sensitivity_outcomes[j]]) {
            const c = document.getElementById(`sa-r${i}c${j}`);
            c.classList.add('sa-data');
            if(i >= rl) {
              c.classList.add('sa-not-run');
            } else {
              if(i < 1) {
                c.classList.add('sa-brd');
              } else if(this.color_scale.range === 'no') {
                c.style.backgroundColor = 'white';
              } else {
                c.style.backgroundColor =
                    this.color_scale.rgb(this.shade[j][i - 1]);
              }
              if(i > 0 && this.relative_scale) {
                let p = this.perc[j][i - 1];
                // Replace warning sign by dash
                if(p === '\u26A0') p = '-';
                c.innerText = p + (p !== '-' ? '%' : '');
              } else {
                c.innerText = this.data[j][i];
              }
            }
          }
        }
      }
    }
  }

  showOutcome(event, o) {
    // Displays outcome `o` (the name of the variable) below the table
    event.stopPropagation();
    this.outcome_name.innerHTML = o;
  }
  
  selectRun(n) {
    // Selects run `n`, or toggles if already selected
    const rows = this.scroll_area.getElementsByClassName('sa-p-sel');
    for(let i = 0; i < rows.length; i++) {
      rows.item(i).classList.remove('sa-p-sel');
    }
    if(n === this.selected_run) {
      this.selected_run = -1;
    } else if(n < MODEL.sensitivity_runs.length) {
      this.selected_run = n;
      if(n >= 0) document.getElementById(
          `sa-r${n}c0`).parent().classList.add('sa-p-sel');
    }
    VM.setRunMessages(this.selected_run);
  }

  setStatistic() {
    // Update view for selected variable
    this.selected_statistic = this.statistic.value;
    this.updateData();
  }
  
  toggleAbsoluteRelative() {
    // Toggles between # (absolute) and % (relative) display of outcome values
    this.relative_scale = !this.relative_scale;
    this.abs_rel_btn.innerText = (this.relative_scale ? '%' : '#');
    this.updateData();
  }

  setColorScale(event) {
    // Infers clicked color scale button from event, and selects it
    if(event) {
      const cs = event.target.id.split('-')[1];
      this.color_scale.set(cs);
      this.color_scales.rb.classList.remove('sel-cs');
      this.color_scales.no.classList.remove('sel-cs');
      this.color_scales[cs].classList.add('sel-cs');
    }
    this.updateData();
  }
  
  copyTableToClipboard() {
    UI.copyHtmlToClipboard(this.scroll_area.innerHTML);
    UI.notify('Table copied to clipboard (as HTML)');
  }
  
  copyDataToClipboard() {
    UI.notify(UI.NOTICE.WORK_IN_PROGRESS);
  }
  
} // END of class SensitivityAnalysis


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
    this.reset_btn = document.getElementById('xp-reset-btn');
    this.reset_btn.addEventListener(
        'click', () => EXPERIMENT_MANAGER.clearRunResults());
    document.getElementById('xp-delete-btn').addEventListener(
        'click', () => EXPERIMENT_MANAGER.deleteExperiment());
    this.default_message = document.getElementById('experiment-default-message');
    
    this.design = document.getElementById('experiment-design');
    this.params_div = document.getElementById('experiment-params-div');
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
    // The viewer's drop-down selectors
    document.getElementById('viewer-variable').addEventListener( 
        'change', () => EXPERIMENT_MANAGER.setVariable());
    document.getElementById('viewer-statistic').addEventListener( 
        'change', () => EXPERIMENT_MANAGER.setStatistic());
    document.getElementById('viewer-scale').addEventListener( 
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
    
    this.parameter_modal = new ModalDialog('xp-parameter');
    this.parameter_modal.ok.addEventListener(
        'click', () => EXPERIMENT_MANAGER.addParameter());
    this.parameter_modal.cancel.addEventListener(
        'click', () => EXPERIMENT_MANAGER.parameter_modal.hide());

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

    // Initialize properties
    this.reset();
  }

  reset() {
    super.reset();
    this.selected_parameter = '';
    this.edited_selector_index = -1;
    this.edited_dimension_index = -1;
    this.color_scale = new ColorScale('no');
    this.designMode();
  }
  
  updateDialog() {
    this.updateChartList();
    // Warn modeler if no meaningful experiments can be defined
    if(MODEL.outcomeNames.length === 0 && this.suitable_charts.length === 0) {
      this.default_message.style.display = 'block';
      this.params_div.style.display = 'none';
      this.selected_experiment = null;
      // Disable experiment dialog menu buttons
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
    for(let i = 0; i < MODEL.experiments.length; i++) {
      xtl.push(MODEL.experiments[i].title);
    }
    xtl.sort();
    for(let i = 0; i < xtl.length; i++) {
      const
          xi = MODEL.indexOfExperiment(xtl[i]),
          x = (xi < 0 ? null : MODEL.experiments[xi]);
      xl.push(['<tr class="experiment',
          (x == sx ? ' sel-set' : ''),
          '" onclick="EXPERIMENT_MANAGER.selectExperiment(\'',
          escapedSingleQuotes(xtl[i]),
          '\');" onmouseover="EXPERIMENT_MANAGER.showInfo(', xi,
          ', event.shiftKey);"><td>', x.title, '</td></tr>'].join(''));
    }
    document.getElementById('experiment-table').innerHTML = xl.join('');
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
  }

  updateParameters() {
    MODEL.inferDimensions();
    let n = MODEL.dimensions.length,
        canview = true;
    const
        dim_count = document.getElementById('experiment-dim-count'),
        combi_count = document.getElementById('experiment-combi-count'),
        header = document.getElementById('experiment-params-header'),
        x = this.selected_experiment;
    if(!x) {
      dim_count.innerHTML = pluralS(n, ' data dimension') + ' in model';
      combi_count.innerHTML = '';
      header.innerHTML = '(no experiment selected)';
      this.params_div.style.display = 'none';
      return;
    }
    x.updateActorDimension();
    n += x.settings_dimensions.length +
        x.actor_dimensions.length - x.dimensions.length; 
    dim_count.innerHTML = pluralS(n, 'more dimension');
    x.inferActualDimensions();
    x.inferCombinations();
    combi_count.innerHTML = pluralS(x.combinations.length, 'combination');
    if(x.combinations.length === 0) canview = false;
    header.innerHTML = x.title;
    this.params_div.style.display = 'block';
    const tr = [];
    for(let i = 0; i < x.dimensions.length; i++) {
      tr.push(['<tr class="dataset',
          (this.selected_parameter == 'd'+i ? ' sel-set' : ''),
          '" onclick="EXPERIMENT_MANAGER.selectParameter(\'d',
          i, '\');"><td>',
          setString(x.dimensions[i]),
          '</td></tr>'].join(''));
    }
    document.getElementById('experiment-dim-table').innerHTML = tr.join('');
    // Add button must be enabled only if there still are unused dimensions
    if(x.dimensions.length >= MODEL.dimensions.length +
        x.settings_dimensions.length + x.actor_dimensions.length) {
      document.getElementById('xp-d-add-btn').classList.add('v-disab');
    } else {
      document.getElementById('xp-d-add-btn').classList.remove('v-disab');
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
    document.getElementById('experiment-chart-table').innerHTML = tr.join('');
    if(x.charts.length === 0) canview = false;
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
    // Enable viewing only if > 1 dimensions and > 1 charts
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
    const n = this.new_modal.element('name').value.trim();
    const x = MODEL.addExperiment(n);
    if(x) {
      this.new_modal.hide();
      this.selected_experiment = x;
      this.updateDialog();
    }
  }
  
  promptForName() {
    if(this.selected_experiment) {
      this.rename_modal.element('former-name').innerHTML =
          this.selected_experiment.title;
      this.rename_modal.element('name').value = '';
      this.rename_modal.show('name');
    }
  }
  
  renameExperiment() {
    if(this.selected_experiment) {
      const
          nel = this.rename_modal.element('name'),
          n = UI.cleanName(nel.value);
      // Show modeler the "cleaned" new name
      nel.value = n;
      // Keep prompt open if title is empty string
      if(n) {
        // Warn modeler if name already in use for some experiment
        if(MODEL.indexOfExperiment(n) >= 0) {
          UI.warn(`An experiment with title "${n}" already exists`);
        } else {
          this.selected_experiment.title = n;
          this.rename_modal.hide();
          this.updateDialog();
        }
      }
    }
  }
  
  designMode() {
    // Switch to default view
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
      document.getElementById('viewer-statistic').value = x.selected_statistic;
      this.updateViewerVariable();
      // NOTE: calling updateSpinner with dir=0 will update without changes
      this.updateSpinner('c', 0);
      this.drawTable(); 
      document.getElementById('viewer-scale').value = x.selected_scale;
      this.setColorScale(x.selected_color_scale);
      this.viewer.style.display = 'block';
    }
  }
  
  updateViewerVariable() {
    // Update the variable drop-down selector of the viewer
    const x = this.selected_experiment;
    if(x) {
      x.inferVariables();
      if(x.selected_variable === '') {
        x.selected_variable = x.variables[0].displayName;
      }
      const
          ol = [],
          vl = MODEL.outcomeNames;
      for(let i = 0; i < x.variables.length; i++) {
        vl.push(x.variables[i].displayName); 
      }
      vl.sort();
      for(let i = 0; i < vl.length; i++) {
        ol.push(['<option value="', vl[i], '"',
            (vl[i] == x.selected_variable ? ' selected="selected"' : ''),
            '>', vl[i], '</option>'].join(''));
      }
      document.getElementById('viewer-variable').innerHTML = ol.join('');
    }
  }
  
  drawTable() {
    // Draw experimental design as table
    const x = this.selected_experiment;
    if(x) {
      this.clean_columns = [];
      this.clean_rows = [];
      // Calculate the actual number of columns and rows of the table
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
            // Calculate the dimension selector index
            const dsi = Math.floor(
                i / rowsperdim[j]) % this.clean_rows[j].length;
            lth += ['<th', rsp, ' class="scen-hdr" style="background-color: ',
                'rgba(100, 170, 255, ', 1 - j * bstep, ')">',
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
  
  toggleChartCombi(n, shift, alt) {
    // Set `n` to be the chart combination, or toggle if Shift-key is pressed,
    // or execute single run if Alt-key is pressed
    const x = this.selected_experiment;
    if(x && alt && n >= 0) {
      this.startExperiment(n);
      return;
    }
    if(x && n < x.combinations.length) {
      // Clear current selection unless Shift-key is pressed 
      if(!shift) x.chart_combinations.length = 0;
      // Toggle => add if not in selection, otherwise remove
      const ci = x.chart_combinations.indexOf(n);
      if(ci < 0) {
        x.chart_combinations.push(n);
      } else {
        x.chart_combinations.splice(ci, 1);
      }
    }
    this.updateData();
    if(MODEL.running_experiment) {
      // NOTE: do NOT do this while VM is solving, as this would interfer!
      UI.notify('Selected run cannot be viewed while running an experiment');
    } else {
      // Show the messages for this run in the monitor
      VM.setRunMessages(n);
      // Update the chart
      CHART_MANAGER.resetChartVectors();
      CHART_MANAGER.updateDialog();
    }
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
      for(let i = 0; i < combi.length; i++) {
        const sel = combi[i];
        html.push('<h3>Selector <tt>', sel, '</tt></h3>');
        // List associated model settings (if any)
        list.length = 0;
        for(let j = 0; j < x.settings_selectors.length; j++) {
          const ss = x.settings_selectors[j].split('|');
          if(sel === ss[0]) list.push(ss[1]);
        }
        if(list.length > 0) {
          html.push('<p><em>Model settings:</em> <tt>', list.join(';'),
              '</tt></p>');
        }
        // List associated actor settings (if any)
        list.length = 0;
        for(let j = 0; j < x.actor_selectors.length; j++) {
          const as = x.actor_selectors[j];
          if(sel === as.selector) {
            list.push(as.round_sequence);
          }
        }
        if(list.length > 0) {
          html.push('<p><em>Actor settings:</em> <tt>', list.join(';'),
              '</tt></p>');
        }
        // List associated datasets (if any)
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
    // Fall-through (should not occur)
    return null;
  }
  
  showInfo(n, shift) {
    // Display documentation for the n-th experiment defined in the model
    // NOTE: skip when viewer is showing!
    if(!UI.hidden('experiment-viewer')) return;
    if(n < MODEL.experiments.length) {
      // NOTE: mouse move over title in viewer passes n = -1 
      const x = (n < 0 ? this.selected_experiment : MODEL.experiments[n]);
      DOCUMENTATION_MANAGER.update(x, shift);
    }
  }
  
  showRunInfo(n, shift) {
    // Display information on the n-th combination if docu-viewer is visible
    // and cursor is moved over run cell while Shift button is held down
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
      for(let i = 0; i < x.runs.length; i++) {
        const
            r = x.runs[i],
            rr = r.results[rri];
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
      // Scale data as selected
      const scaled = data.slice();
      // NOTE: scale only after the experiment has been completed AND
      // configurations have been defined (otherwise comparison is pointless)
      if(x.completed && this.nr_of_configurations > 0) {
        const n = scaled.length / this.nr_of_configurations;
        if(x.selected_scale === 'dif') {
          // Compute difference: current configuration - reference configuration
          const rc = x.reference_configuration;
          for(let i = 0; i < this.nr_of_configurations; i++) {
            if(i != rc) {
              for(let j = 0; j < n; j++) {
                scaled[i * n + j] =  scaled[i * n + j] - scaled[rc * n + j];
              }
            }
          }
          // Set difference for reference configuration itself to 0
          for(let i = 0; i < n; i++) {
            scaled[rc * n + i] = 0;
          }
        } else if(x.selected_scale === 'reg') {
          // Compute regret: current config - high value config in same scenario
          for(let i = 0; i < n; i++) {
            // Get high value
            let high = VM.MINUS_INFINITY;
            for(let j = 0; j < this.nr_of_configurations; j++) {
              high = Math.max(high, scaled[j * n + i]);
            }
            // Scale (so high config always has value 0)
            for(let j = 0; j < this.nr_of_configurations; j++) {
              scaled[j * n + i] -= high;
            }            
          }
        }
      }
      // For color scales, compute normalized scores
      let normalized = scaled.slice(),
          high = VM.MINUS_INFINITY,
          low = VM.PLUS_INFINITY;
      for(let i = 0; i < normalized.length; i++) {
        high = Math.max(high, normalized[i]);
        low = Math.min(low, normalized[i]);
      }
      // Avoid too small value ranges
      const range = (high - low < VM.NEAR_ZERO ? 0 : high - low);
      if(range > 0) {
        for(let i = 0; i < normalized.length; i++) {
          normalized[i] = (normalized[i] - low) / range;
        }
      }
      // Format data such that they all have same number of decimals
      let formatted = [];
      for(let i = 0; i < scaled.length; i++) {
        formatted.push(VM.sig4Dig(scaled[i]));
      }
      uniformDecimals(formatted);
      // Display formatted data in cells
      for(let i = 0; i < x.combinations.length; i++) {
        const cell = document.getElementById('xr' + i);
        if(i < x.runs.length) {
          cell.innerHTML = formatted[i];
          cell.classList.remove('not-run');
          cell.style.backgroundColor = this.color_scale.rgb(normalized[i]);
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
      x.selected_variable = document.getElementById('viewer-variable').value;
      this.updateData();
    }
  }
  
  setStatistic() {
    // Update view for selected variable
    const x = this.selected_experiment;
    if(x) {
      x.selected_statistic = document.getElementById('viewer-statistic').value;
      this.updateData();
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
      for(let i = 0; i < spl.length; i++) {
        if(rem) {
          spl.item(i).classList.remove('no-spin');
        } else {
          spl.item(i).classList.add('no-spin');
        }
      }
      if(dir != 0 ) this.drawTable();
    }
  }
  
  setScale() {
    // Update view for selected scale
    const x = this.selected_experiment;
    if(x) {
      x.selected_scale = document.getElementById('viewer-scale').value;
      this.updateData();
    }
  }
  
  setColorScale(cs) {
    // Update view for selected color scale (values: rb, br, rg, gr or no)
    const x = this.selected_experiment;
    if(x) {
      if(cs) {
        x.selected_color_scale = cs;
        this.color_scale.set(cs);
        const csl = this.viewer.getElementsByClassName('color-scale');
        for(let i = 0; i < csl.length; i++) {
          csl.item(i).classList.remove('sel-cs');
        }
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
  
  selectParameter(p) {
    this.selected_parameter = p;
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
  
  editSettingsDimensions() {
    // Open dialog for editing model settings dimensions
    const x = this.selected_experiment, rows = [];
    if(x) {
      // Initialize selector list
      for(let i = 0; i < x.settings_selectors.length; i++) {
        const sel = x.settings_selectors[i].split('|');
        rows.push('<tr onclick="EXPERIMENT_MANAGER.editSettingsSelector(', i,
            ');"><td width="25%">', sel[0], '</td><td>', sel[1], '</td></tr>');
      }
      this.settings_modal.element('s-table').innerHTML = rows.join('');
      // Initialize combination list
      rows.length = 0;
      for(let i = 0; i < x.settings_dimensions.length; i++) {
        const dim = x.settings_dimensions[i];
        rows.push('<tr onclick="EXPERIMENT_MANAGER.editSettingsDimension(', i,
            ');"><td>', setString(dim), '</td></tr>');
      }
      this.settings_modal.element('d-table').innerHTML = rows.join('');
      this.settings_modal.show();
      // NOTE: clear infoline because dialog can generate warnings that would
      // otherwise remain visible while no longer relevant
      UI.setMessage('');
    }
  }

  closeSettingsDimensions() {
    // Hide editor, and then update the experiment manager to reflect changes
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
    md.show('string');
  }
  
  modifySettingsSelector() {
    // Accepts valid selectors and settings, tolerating a decimal comma
    let x = this.selected_experiment;
    if(x) {
      const
          md = this.settings_selector_modal,
          sc = md.element('code'),
          ss = md.element('string'),
          code = sc.value.replace(/[^\w\+\-\%]/g, ''),
          value = ss.value.trim().replace(',', '.'),
          add =  this.edited_selector_index < 0;
      // Remove selector if either field has been cleared
      if(code.length === 0 || value.length === 0) {
        if(!add) {
          x.settings_selectors.splice(this.edited_selector_index, 1);
        }
      } else {
        // Check for uniqueness of code
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
        const re = /^(s\=\d+(\.?\d+)?(yr?|wk?|d|h|m|min|s)\s+)?(t\=\d+(\-\d+)?\s+)?(b\=\d+\s+)?(l=\d+\s+)?$/i;
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
          for(let i = 0; i < x.settings_dimensions.length; i++) {
            const si = x.settings_dimensions[i].indexOf(oc);
            if(si >= 0) x.settings_dimensions[i][si] = code;
          }
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
 
  editActorDimension() {
    // Open dialog for editing the actor dimension
    const x = this.selected_experiment, rows = [];
    if(x) {
      // Initialize selector list
      for(let i = 0; i < x.actor_selectors.length; i++) {
        rows.push('<tr onclick="EXPERIMENT_MANAGER.editActorSelector(', i,
            ');"><td>', x.actor_selectors[i].selector,
            '</td><td style="font-family: monospace">',
            x.actor_selectors[i].round_sequence, '</td></tr>');
      }
      this.actor_dimension_modal.element('table').innerHTML = rows.join('');
      this.actor_dimension_modal.show();
      // NOTE: clear infoline because dialog can generate warnings that would
      // otherwise remain visible while no longer relevant
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
    // NOTE: copy experiment property to modal dialog property, so that changes
    // are made only when OK is clicked
    md.clusters = [];
    for(let i = 0; i < x.clusters_to_ignore.length; i++) {
      const cs = x.clusters_to_ignore[i];
      md.clusters.push({cluster: cs.cluster, selectors: cs. selectors});
    }
    md.cluster_index = -1;
    for(let k in MODEL.clusters) if(MODEL.clusters.hasOwnProperty(k)) {
      const c = MODEL.clusters[k];
      // Do not add top cluster, nor clusters already on the list
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
      // Show cluster+selectors list
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
      // Hide list and show "no clusters set to be ignored"
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
    // Set selected cluster index to `n`
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
      // Remove cluster from select so it cannot be added again
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
    // Delete selected cluster+selectors from list
    const md = this.clusters_modal;
    if(md.cluster_index >= 0) {
      md.clusters.splice(md.cluster_index, 1);
      md.cluster_index = -1;
      this.updateClusterList();
    }
  }
  
  modifyClustersToIgnore() {
    // Replace current list by cluster+selectors list of modal dialog
    const
        md = this.clusters_modal,
        x = this.selected_experiment;
    if(x) x.clusters_to_ignore = md.clusters;
    md.hide();
    this.updateDialog();
  }

  promptForParameter(type) {
    // Open dialog for adding new dimension or chart
    const x = this.selected_experiment;
    if(x) {
      const ol = [];
      this.parameter_modal.element('type').innerHTML = type;
      if(type === 'dimension') {
        // Compile a list of data dimensions and settings dimensions
        // NOTE: slice to avoid adding settings dimensions to the data dimensions
        const dl = MODEL.dimensions.slice();
        for(let i = 0; i < x.settings_dimensions.length; i++) {
          dl.push(x.settings_dimensions[i]);
        }
        for(let i = 0; i < x.actor_dimensions.length; i++) {
          dl.push(x.actor_dimensions[i]);
        }
        for(let i = 0; i < dl.length; i++) {
          const d = dl[i];
          // NOTE: exclude dimensions already in the selected experiment
          if (x.hasDimension(d) < 0) {
            const ds = setString(d);
            ol.push(`<option value="${ds}">${ds}</option>`);
          }
        }
      } else { 
        for(let i = 0; i < this.suitable_charts.length; i++) {
          const c = this.suitable_charts[i];
          // NOTE: exclude charts already in the selected experiment
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
    // Add parameter (dimension or chart) to experiment
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
        // Convert set notation to selector list
        const d = name.replace(/[\{\}]/g, '').split(', ');
        // Append it to the list
        x.dimensions.push(d);
      }
      this.updateParameters();
      this.parameter_modal.hide();
    }
  }
  
  deleteParameter() {
    // Remove selected dimension or chart from selected experiment
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
    // Give visual feedback by setting background color to white
    this.exclude.style.backgroundColor = 'white';
  }
  
  setExclusions() {
    // Sanitize string before accepting it as space-separated selector list
    const
        x = this.selected_experiment;
    if(x) {
      x.excluded_selectors = this.exclude.value.replace(
          /[\;\,]/g, ' ').trim().replace(
          /[^a-zA-Z0-9\+\-\%\_\s]/g, '').split(/\s+/).join(' ');
      this.exclude.value = x.excluded_selectors;
      this.updateParameters();
    }
    this.exclude.style.backgroundColor = 'inherit';
  }
  
  readyButtons() {
    // Set experiment run control buttons in "ready" state
    this.pause_btn.classList.add('off');
    this.stop_btn.classList.add('off');
    this.start_btn.classList.remove('off', 'blink');
  }
  
  pausedButtons(aci) {
    // Set experiment run control buttons in "paused" state
    this.pause_btn.classList.remove('blink');
    this.pause_btn.classList.add('off');
    this.start_btn.classList.remove('off');
    // Blinking start button indicates: paused -- click to resume
    this.start_btn.classList.add('blink');
    this.viewer_progress.innerHTML = `Run ${aci} PAUSED`;
  }
  
  resumeButtons() {
    // Changes buttons to "running" state, and return TRUE if state was "paused"
    const paused = this.start_btn.classList.contains('blink');
    this.start_btn.classList.remove('blink');
    this.start_btn.classList.add('off');
    this.pause_btn.classList.remove('off');
    this.stop_btn.classList.add('off');
    return paused;
  }
  
  pauseExperiment() {
    // Interrupt solver but retain data on server and allow resume
    UI.notify('Run sequence will be suspended after the current run');
    this.pause_btn.classList.add('blink');
    this.stop_btn.classList.remove('off');
    this.must_pause = true;
  }
  
  stopExperiment() {
    // Interrupt solver but retain data on server (and no resume)
    VM.halt();
    MODEL.running_experiment = null;
    UI.notify('Experiment has been stopped');
    this.viewer_progress.innerHTML = '';
    this.readyButtons();
  }
  
  showProgress(ci, p, n) {
    // Show progress in the viewer
    this.viewer_progress.innerHTML = `Run ${ci} (${p}% of ${n})`;
  }
  
  copyTableToClipboard() {
    UI.copyHtmlToClipboard(
        document.getElementById('viewer-scroll-area').innerHTML);
    UI.notify('Table copied to clipboard (as HTML)');
  }
  
} // END of class GUIExperimentManager


// CLASS DocumentationManager
class DocumentationManager {
  constructor() {
    this.dialog = UI.draggableDialog('documentation');
    UI.resizableDialog('documentation', 'DOCUMENTATION_MANAGER');
    this.close_btn = document.getElementById('documentation-close-btn');
    this.title = document.getElementById('docu-item-title');
    this.editor = document.getElementById('docu-editor');
    this.viewer = document.getElementById('docu-viewer');
    this.edit_btn = document.getElementById('docu-edit-btn');
    this.copy_btn = document.getElementById('docu-copy-btn');
    this.model_info_btn = document.getElementById('docu-model-info-btn');
    this.compare_btn = document.getElementById('compare-btn');
    this.save_btn = document.getElementById('docu-save-btn');
    this.cancel_btn = document.getElementById('docu-cancel-btn');
    this.info_btn = document.getElementById('docu-info-btn');
    this.resume_btn = document.getElementById('docu-resume-btn');
    this.symbols = document.getElementById('docu-symbols');
    this.message_hint = document.getElementById('docu-message-hint');
    // Make toolbar buttons responsive
    this.close_btn.addEventListener('click',
        (event) => UI.toggleDialog(event));
    this.edit_btn.addEventListener('click', 
        () => DOCUMENTATION_MANAGER.editMarkup());
    this.model_info_btn.addEventListener('click',
        () => DOCUMENTATION_MANAGER.showAllDocumentation());
    this.copy_btn.addEventListener('click',
        () => DOCUMENTATION_MANAGER.copyDocToClipboard());
    this.save_btn.addEventListener('click',
        () => DOCUMENTATION_MANAGER.saveMarkup());
    this.cancel_btn.addEventListener('click',
        () => DOCUMENTATION_MANAGER.stopEditing());
    this.info_btn.addEventListener('click',
        () => DOCUMENTATION_MANAGER.showGuidelines());
    this.resume_btn.addEventListener('click',
        () => DOCUMENTATION_MANAGER.hideGuidelines());
    const
        sym_btns = document.getElementsByClassName('docu-sym'),
        insert_sym = (event) =>
            DOCUMENTATION_MANAGER.insertSymbol(event.target.innerHTML);
    for(let i = 0; i < sym_btns.length; i++) {
      sym_btns[i].addEventListener('click', insert_sym);
    }
    // NOTE: Compare button opens a modal dialog to prompt for file
    this.compare_btn.addEventListener('click',
        () => DOCUMENTATION_MANAGER.comparison_modal.show());
    this.comparison_modal = new ModalDialog('comparison');
    this.comparison_modal.ok.addEventListener('click',
        () => FILE_MANAGER.loadModelToCompare());
    this.comparison_modal.ok.addEventListener('click',
        () => DOCUMENTATION_MANAGER.comparison_modal.hide());

    // Intitialize markup rewriting rules
    this.rules = [
      { // No HTML entities
        pattern: /&/g,  
        rewrite: '&amp;'
      },
      { // No HTML tags
        pattern: /</g,  
        rewrite: '&lt;'
      },
      { // URLs become anchors
        pattern: /((http|https):\/\/[^ "]+)/gmi,  
        rewrite: '<a href="$1" target="_blank">$1</a>'
      },
      { // 3 or more trailing spaces before a newline become a line break
        pattern: / {3,}$/gm,  
        rewrite: '<br>'
      },
      { // Text following ^ (until next ^ or whitespace) becomes superscript
        pattern: /\^([^\s\^]*)[\^]?/g,
        rewrite: '<sup>$1</sup>'
      },
      { // Text following _ (until next _ or whitespace) becomes subscript
        pattern: /_([^\s_]*)_?/g,
        rewrite: '<sub>$1</sub>'
      },
      
      // NOTE: all other patterns are "enclosure" patterns     

      { // Unlike MediaWiki, more = signs make BIGGER headers
        pattern: /===([^\s].*[^\s]?)===/g,
        rewrite: '<h1>$1</h1>'
      },
      {
        pattern: /==([^\s].*[^\s]?)==/g,
        rewrite: '<h2>$1</h2>'
      },
      {
        pattern: /=([^\s].*[^\s]?)=/g,
        rewrite: '<h3>$1</h3>'
      },
      { // Double asterisks make **bold face** print
        pattern: /\*\*([^\s][^\*]*[^\s]?)\*\*/g,
        rewrite: '<strong>$1</strong>'
      },
      { // Single asterisk makes *italic* print
        pattern: /\*([^\s][^\*]*[^\s]?)\*/g,
        rewrite: '<em>$1</em>'
      },
      { // Double minus makes deleted text (red + strike-through)
        pattern: /--([^\s].*[^\s]?)--/g,
        rewrite: '<del>$1</del>'
      },
      { // Double plus makes inserted text (blue + underline)
        pattern: /\+\+([^\s].*[^\s]?)\+\+/g,
        rewrite: '<ins>$1</ins>'
      },
      { // Double grave makes highlighted text (yellow text background)
        pattern: /``([^`]+)``/g,
        rewrite: '<cite>$1</cite>'
      },
      { // Single grave makes monospaced text
        pattern: /`([^`]+)`/g,
        rewrite: '<tt>$1</tt>'
      },
    ];

    // Default content to display when no entity is being viewed
    this.about_linny_r = `
<div style="font-family: sans-serif; font-size: 10px; ">
  <img src="images/logo.png" style="height:25px; margin-right: 8px">
  <div style="display: inline-block; min-height: 20px;
              vertical-align: top; padding-top: 8px">
    [LINNY_R_VERSION]
  </div>
</div>
<div style="font-family: serif; font-size: 12px">
  <p><a href="https://linny-r.info" target="blank">Documentation
    on Linny-R</a> is still scant, but you can learn a lot by
    moving the cursor over buttons, and read the tool-tips that then typically
    will appear.
  </p>
  <p>The primary function of this dialog is to allow you to document a model.
    As you <em><strong>hold down the</em><span style="font: 11px sans-serif">
    Shift</span><em> key</strong></em>, and then move the cursor over a model
    entity (nodes or links in the diagram, but also actors, datasets, charts,
    experiments or modules listed in a dialog), annotations (if any) will
    appear here.
  </p>
  <p>To add or edit an annotation, release the
    <span style="font: 11px sans-serif">Shift</span> key, and then
    click on the <span style="font: 11px sans-serif">Edit</span> button in the
    left corner below.
  </p>
</div>`;

    // Markup guidelines to display when modeler clicks on the info-button
    this.markup_guide = `
<h3>Linny-R Markup Conventions</h3>
<p>You can format your documentation text using these markup conventions:</p>
<table style="width: 100%; table-layout: fixed">
  <tr>
    <td class="markup">*italic*, **bold**, or ***both***</td>
    <td class="markdown">
      <em>italic</em>, <strong>bold</strong>, or <em><strong>both</strong></em>
    </td>
  </tr>
  <tr>
    <td class="markup">` +
      '``highlighted text``' + `, ++new text++, or --deleted text--
    </td>
    <td class="markdown">
      <cite>highlighted text</cite>, <ins>new text</ins>,
      or <del>deleted text</del>
    </td>
  </tr>
  <tr>
    <td class="markup">
      ^super^script and _sub_script, but also m^3 and CO_2 shorthand
    </td>
    <td class="markdown">
      <sup>super</sup>script and <sub>sub</sub>script,
      but also m<sup>3</sup> and CO<sub>2</sub> shorthand
    </td>
  </tr>
  <tr>
    <td class="markup">URLs become links: https://linny-r.org</td>
    <td class="markdown">URLs become links:
      <a href="https://linny-r.org" target="_blank">https://linny-r.org</a>
    </td>
  </tr>
  <tr>
    <td class="markup">
      Blank lines<br><br>separate paragraphs;<br>single line breaks do not.
    </td>
    <td class="markdown">
      <p>Blank lines</p>
      <p>separate paragraphs; single line breaks do not.</p>
    </td>
  </tr>
  <tr>
    <td class="markup">List items start with a dash<br>- like this,<br>
      - until the next item,<br>&nbsp;&nbsp;or a blank line.<br><br>
      Numbered list items start with digit-period-space<br>
      3. like this,<br>
      3. but the numbering<br>&nbsp;&nbsp;&nbsp;always starts at 1.
    </td>
    <td class="markdown">
      <p>List items start with a dash</p>
      <ul>
        <li>like this,</li>
        <li>until the next item, or a blank line.</li>
      </ul>
      <p>Numbered list items start with digit-period-space</p>
      <ol>
        <li>like this,</li>
        <li>but the numbering always starts at 1.</li>
      </ol>
    </td>
  </tr>
  <tr>
    <td class="markup">
      =Small header=<br><br>==Medium header==<br><br>===Large header===
    </td>
    <td class="markdown">
      <h3>Small header</h3><h2>Medium header</h2><h1>Large header</h1>
    </td>
  </tr>
  <tr>
    <td class="markup">
      A single line with only dashes and spaces, e.g.,<br><br>- - -<br><br>
      becomes a horizontal rule.
    </td>
    <td class="markdown">
      <p>A single line with only dashes and spaces, e.g.,</p><hr>
      <p>becomes a horizontal rule.</p>
    </td>
  </tr>
</table>`;

    // Initialize properties
    this.reset();
  }

  reset() {
    this.entity = null;
    this.visible = false;
    this.editing = false;
    this.markup = '';
    this.info_messages = [];
    this.symbols.style.display = 'none';
  }

  clearEntity(list) {
    // To be called when entities are deleted 
    if(list.indexOf(this.entity) >= 0) {
      this.stopEditing();
      this.entity = null;
      this.title.innerHTML = 'Documentation';
      this.viewer.innerHTML = this.about_linny_r;
    }
  }
  
  checkEntity() {
    // Check if entity still exists in model
    const e = this.entity;
    if(!e || e === MODEL) return;
    if(e.hasOwnProperty('name') && !MODEL.objectByName(e.name)) {
      // Clear entity if not null, but not in model
      this.clearEntity([e]);
    }
  }

  updateDialog() {
    // Resizing dialog needs no special action, but entity may have been
    // deleted or renamed
    this.checkEntity();
    if(this.entity) {
      this.title.innerHTML =
          `<em>${this.entity.type}:</em>&nbsp;${this.entity.displayName}`;
    }
  }

  update(e, shift) {
    // Display name of entity under cursor on the infoline, and details in
    // the documentation dialog
    if(!e) return;
    const
        et = e.type,
        edn = e.displayName;
    // TO DO: when debugging, display additional data for nodes on the infoline 
    UI.setMessage(
        e instanceof NodeBox ? e.infoLineName : `<em>${et}:</em> ${edn}`);
    // NOTE: update the dialog ONLY when shift is pressed (this permits modelers
    // to rapidly browse comments without having to click on entities, and then
    // release the shift key to move to the documentation dialog to edit)
    // Moreover, the documentation dialog must be visible, and the entity must
    // have the `comments` property
    if(!this.editing && shift && this.visible && e.hasOwnProperty('comments')) {
      this.title.innerHTML = `<em>${et}:</em>&nbsp;${edn}`;
      this.entity = e;
      this.markup = (e.comments ? e.comments : '');
      this.editor.value = this.markup;
      this.viewer.innerHTML = this.markdown;
      this.edit_btn.classList.remove('disab');
      this.edit_btn.classList.add('enab');
      // NOTE: permit documentation of the model by raising the dialog
      if(this.entity === MODEL) this.dialog.style.zIndex = 101;
    }
  }
  
  rewrite(str) {
    // Apply all the rewriting rules to `str`
    str = '\n' + str + '\n';
    this.rules.forEach(
        (rule) => { str = str.replace(rule.pattern, rule.rewrite); });
    return str.trim();
  }
  
  makeList(par, isp, type) {
    // Split on the *global multi-line* item separator pattern
    const splitter = new RegExp(isp, 'gm'),
          list = par.split(splitter);
    if(list.length < 2) return false;
    // Now we know that the paragraph contains at least one list item line
    let start = 0;
    // Paragraph may start with plain text, so check using the original pattern
    if(!par.match(isp)) {
      // If so, retain this first part as a separate paragraph...
      start = 1;
      // NOTE: add it only if it contains text
      par = (list[0].trim() ? `<p>${this.rewrite(list[0])}</p>` : '');
      // ... and clear it as list item
      list[0] = '';
    } else {
      par = '';
    }
    // Rewrite each list item fragment that contains text 
    for(let j = start; j < list.length; j++) {
      list[j] = (list[j].trim() ? `<li>${this.rewrite(list[j])}</li>` : '');
    }
    // Return assembled parts
    return [par, '<', type, 'l>', list.join(''), '</', type, 'l>'].join('');
  }
  
  get markdown() {
    if(!this.markup) this.markup = '';
    const html = this.markup.split(/\n{2,}/);
    let list;
    for(let i = 0; i < html.length; i++) {
      // Paragraph with only dashes and spaces becomes a horizontal rule 
      if(html[i].match(/^( *-)+$/)) {
        html[i] = '<hr>';
      // Paragraph may contain a bulleted list 
      } else if ((list = this.makeList(html[i], /^ *- +/, 'u')) !== false) {
        html[i] = list;
      // Paragraph may contain a numbered list 
      } else if ((list = this.makeList(html[i], /^ *\d+. +/, 'o')) !== false) {
        html[i] = list;
      // Otherwise: default HTML paragraph
      } else {
        html[i] = `<p>${this.rewrite(html[i])}</p>`;
      }
    }
    return html.join('');
  }
  
  editMarkup() {
    if(this.edit_btn.classList.contains('disab')) return;
    this.dialog.style.opacity = 1;
    this.viewer.style.display = 'none';
    this.editor.style.display = 'block';
    this.edit_btn.style.display = 'none';
    this.model_info_btn.style.display = 'none';
    this.copy_btn.style.display = 'none';
    this.compare_btn.style.display = 'none';
    this.message_hint.style.display = 'none';
    this.save_btn.style.display = 'block';
    this.cancel_btn.style.display = 'block';
    this.info_btn.style.display = 'block';
    this.symbols.style.display = 'block';
    this.editor.focus();
    this.editing = true;
  }
  
  insertSymbol(sym) {
    // Insert symbol (clicked item in list below text area) into text area 
    this.editor.focus();
    let p = this.editor.selectionStart;
    const
        v = this.editor.value,
        tb = v.substring(0, p),
        ta = v.substring(p, v.length);
    this.editor.value = `${tb}${sym}${ta}`;
    p += sym.length;
    this.editor.setSelectionRange(p, p);
  }
  
  saveMarkup() {
    this.markup = this.editor.value.trim();
    this.checkEntity();
    if(this.entity) {
      this.entity.comments = this.markup;
      this.viewer.innerHTML = this.markdown;
      if(this.entity instanceof Link) {
        UI.drawLinkArrows(MODEL.focal_cluster, this.entity);
      } else if(this.entity instanceof Constraint) {
        UI.paper.drawConstraint(this.entity);
      } else if (typeof this.entity.draw === 'function') {
        // Only draw if the entity responds to that method
        this.entity.draw();
      }
    }
    this.stopEditing();
  }

  stopEditing() {
    this.editing = false;
    this.editor.style.display = 'none';
    this.viewer.style.display = 'block';
    this.save_btn.style.display = 'none';
    this.cancel_btn.style.display = 'none';
    this.info_btn.style.display = 'none';
    this.symbols.style.display = 'none';
    this.edit_btn.style.display = 'block';
    this.model_info_btn.style.display = 'block';
    this.copy_btn.style.display = 'block';
    this.compare_btn.style.display = 'block';
    this.message_hint.style.display = 'block';
    this.dialog.style.opacity = 0.85;
  }

  showGuidelines() {
    this.editor.style.display = 'none';
    this.save_btn.style.display = 'none';
    this.cancel_btn.style.display = 'none';
    this.info_btn.style.display = 'none';
    this.symbols.style.display = 'none';
    this.viewer.innerHTML = this.markup_guide;
    this.viewer.style.display = 'block';
    this.resume_btn.style.display = 'block';
  }

  hideGuidelines() {
    this.viewer.style.display = 'none';
    this.resume_btn.style.display = 'none';
    this.editor.style.display = 'block';
    this.save_btn.style.display = 'block';
    this.cancel_btn.style.display = 'block';
    this.info_btn.style.display = 'block';
    this.symbols.style.display = 'block';
    this.viewer.innerHTML = this.editor.value.trim();
    this.editor.focus();
  }

  addMessage(msg) {
    // Append message to the info messages list
    if(msg) this.info_messages.push(msg);
    // Update dialog only when it is showing
    if(!UI.hidden(this.dialog.id)) this.showInfoMessages(true);
  }
  
  showInfoMessages(shift) {
    // Show all messages that have appeared on the status line
    const 
        n = this.info_messages.length,
        title = pluralS(n, 'message') + ' since the current model was loaded';
    document.getElementById('info-line').setAttribute(
        'title', 'Status: ' + title);
    if(shift && !this.editing) {
      const divs = [];
      for(let i = n - 1; i >= 0; i--) {
        const
            m = this.info_messages[i],
            first = (i === n - 1 ? '-msg first' : '');
        divs.push('<div><div class="', m.status, '-time">', m.time, '</div>',
            '<div class="', m.status, first, '-msg">', m.text, '</div></div>');
      }
      this.viewer.innerHTML = divs.join('');
      // Set the dialog title
      this.title.innerHTML = title;
    }
  }

  showArrowLinks(arrow) {
    // Show list of links represented by a composite arrow
    const
        n = arrow.links.length,
        msg = 'Arrow represents ' + pluralS(n, 'link');
    UI.setMessage(msg);
    if(this.visible && !this.editing) {
      // Set the dialog title
      this.title.innerHTML = msg;
      // Show list
      const lis = [];
      let l, dn, c, af;
      for(let i = 0; i < n; i++) {
        l = arrow.links[i];
        dn = l.displayName;
        if(l.from_node instanceof Process) {
          c = UI.color.produced;
          dn = dn.replace(l.from_node.displayName,
              `<em>${l.from_node.displayName}</em>`); 
        } else if(l.to_node instanceof Process) {
          c = UI.color.consumed;
          dn = dn.replace(l.to_node.displayName,
            `<em>${l.to_node.displayName}</em>`); 
        } else {
          c = 'gray';
        }
        if(MODEL.solved && l instanceof Link) {
          af = l.actualFlow(MODEL.t);
          if(Math.abs(af) > VM.SIG_DIF_FROM_ZERO) {
            dn = dn.replace(UI.LINK_ARROW,
                `<span style="color: ${c}">\u291A[${VM.sig4Dig(af)}]\u21FE</span>`);
          }
        }
        lis.push(`<li>${dn}</li>`);
      }
      lis.sort();
      this.viewer.innerHTML = `<ul>${lis.join('')}</ul>`;
    }
  }

  showHiddenIO(node, arrow) {
    // Show list of products or processes linked to node by an invisible arrow
    let msg, iol;
    if(arrow === UI.BLOCK_IN) {
      iol = node.hidden_inputs;
      msg = pluralS(iol.length, 'more input');
    } else if(arrow === UI.BLOCK_OUT) {
      iol = node.hidden_outputs;
      msg = pluralS(iol.length, 'more output');
    } else {
      iol = node.hidden_io; 
      msg = pluralS(iol.length, 'more double linkage');
    }
    msg = node.displayName + ' has ' + msg;
    UI.on_block_arrow = true;
    UI.setMessage(msg);
    if(this.visible && !this.editing) {
      // Set the dialog title
      this.title.innerHTML = msg;
      // Show list
      const lis = [];
      for(let i = 0; i < iol.length; i++) {
        lis.push(`<li>${iol[i].displayName}</li>`);
      }
      lis.sort();
      this.viewer.innerHTML = `<ul>${lis.join('')}</ul>`;
    }
  }

  showAllDocumentation() {
    const
        html = [],
        sl = MODEL.listOfAllComments;
    for(let i = 0; i < sl.length; i++) {
      if(sl[i].startsWith('_____')) {
        // 5-underscore leader indicates: start of new category
        html.push('<h2>', sl[i].substring(5), '</h2>');
      } else {
        // Expect model element name...
        html.push('<p><tt>', sl[i], '</tt><br><small>');
        // ... immediately followed by its associated marked-up comments
        i++;
        this.markup = sl[i];
        html.push(this.markdown, '</small></p>');
      }
    }
    this.title.innerHTML = 'Complete model documentation';
    this.viewer.innerHTML = html.join('');
    // Deselect entity and disable editing
    this.entity = null;
    this.edit_btn.classList.remove('enab');
    this.edit_btn.classList.add('disab');
  }
    
  copyDocToClipboard() {
    UI.copyHtmlToClipboard(this.viewer.innerHTML);
    UI.notify('Documentation copied to clipboard (as HTML)');
  }

  compareModels(data) {
    this.comparison_modal.hide();
    this.model = new LinnyRModel('', '');
    // NOTE: while loading, make the second model "main" so it will initialize
    const loaded = MODEL;
    MODEL = this.model;
    try {
      // NOTE: Convert %23 back to # (escaped by function saveModel)
      const xml = parseXML(data.replace(/%23/g, '#'));
      // NOTE: loading, not including => make sure that IO context is NULL
      IO_CONTEXT = null;
      this.model.initFromXML(xml);
    } catch(err) {
      UI.normalCursor();
      UI.alert('Error while parsing model: ' + err);
      // Restore original "main" model
      MODEL = loaded;
      this.model = null;
      return false;
    }
    // Restore original "main" model
    MODEL = loaded;
    try {
      // Store differences as HTML in local storage
      console.log('Storing differences between model A (' + MODEL.displayName +
          ') and model B (' + this.model.displayName + ') as HTML');
      const html = this.differencesAsHTML(MODEL.differences(this.model));
      window.localStorage.setItem('linny-r-differences-A-B', html);
      UI.notify('Comparison report can be viewed ' +
        '<a href="./show-diff.html" target="_blank"><strong>here</strong></a>');
    } catch(err) {
      UI.alert(`Failed to store model differences: ${err}`);
    }
    // Dispose the model-for-comparison
    this.model = null;
    // Cursor is set to WAITING when loading starts
    UI.normalCursor();
  }
  
  propertyName(p) {
    // Returns the name of a Linny-R entity property as HTML-italicized string
    // if `p` is recognized as such, or otherwise `p` itself
    if(p in UI.MC.SETTINGS_PROPS) return `<em>${UI.MC.SETTINGS_PROPS[p]}:</em>`;
    if(UI.MC.ALL_PROPS.indexOf(p) >= 0) return '<em>' + p.charAt(0).toUpperCase() +
        p.slice(1).replace('_', '&nbsp;') + ':</em>';
    return p;
  }

  propertyAsString(p) {
    // Returns the value of `p` as an HTML string for Model Comparison report 
    if(p === true) return '<code>true</code>';
    if(p === false) return '<code>false</code>';
    const top = typeof p;
    if(top === 'number') return VM.sig4Dig(p);
    if(top === 'string') return (p.length === 0 ? '<em>(empty)</em>' : p);
    return p.toString();
  }
  
  differencesAsHTML(d) {
    const html = [];
    let n = (Object.keys(d).length > 0 ? 'D' : 'No d');
    html.push('<h1>' + n + 'ifferences between model A and model B</h1>');
    html.push('<p><em>Model</em> <strong>A</strong> <em>is <u>current</u>, ',
        'model</em> <strong>B</strong> <em>was loaded for comparison only.</em>');
    html.push('<table><tr><th>Model</th><th>Name</th><th>Author</th></tr>');
    html.push('<tr><td>A</td><td>' + this.propertyAsString(MODEL.name) +
        '</td><td>'+ this.propertyAsString(MODEL.author) + '</td></tr>');
    html.push('<tr><td>B</td><td>' + this.propertyAsString(this.model.name) +
        '</td><td>' + this.propertyAsString(this.model.author) +
        '</td></tr></table>');
    if('settings' in d) html.push('<h2>Model settings</h2>',
        this.differenceAsTable(d.settings));
    if('units' in d) html.push('<h2>Units</h2>',
        this.differenceAsTable(d.units));
    for(let i = 0; i < UI.MC.ENTITY_PROPS.length; i++) {
      const e = UI.MC.ENTITY_PROPS[i];
      if(e in d) html.push('<h2>' + this.propertyName(e) + '</h2>',
          this.differenceAsTable(d[e]));
    }
    if('charts' in d) html.push('<h2><em>Charts</em></h2>',
        this.differenceAsTable(d.charts));
    return html.join('\n');
  }

  differenceAsTableRow(dd, k) {
    const d = dd[k];
    // NOTE: recursive method, as cells can contain tables
    let tr = '';
    if(Array.isArray(d) && d.length >= 2) {
      tr = '<tr><td class="mc-name">' + this.propertyName(d[1]) + '</td>';
      if(d[0] === UI.MC.MODIFIED) {
        if(d[2].hasOwnProperty('A') && d[2].hasOwnProperty('B')) {
          // Leaf node showing the differring property values in A and B
          const mfd = markFirstDifference(d[2].A, d[2].B);
          tr += `<td class="mc-modified">${mfd}</td><td>${d[2].B}</td>`;
        } else {
          // Compound "dictionary" of differences
          tr += '<td colspan="2">' + this.differenceAsTable(d[2]) + '</td>';
        }
      } else {
        // Addition and deletions are shown for model A 
        tr += `<td class="mc-${UI.MC.STATE[d[0]]}">${UI.MC.STATE[d[0]]}</td><td></td>`;
      }
      tr += '</tr>';
    } else if(d.hasOwnProperty('A') && d.hasOwnProperty('B')) {
      tr = '<tr><td>' + this.propertyName(k) + '</td><td class="mc-modified">'+
          markFirstDifference(d.A, d.B) + '</td><td class="mc-former">' +
          d.B + '</td></tr>';
    } else {
      tr = '<tr><td>' + this.differenceAsTable(d) + '</td></tr>';
    }
    return tr;
  }

  differenceAsTable(d) {
    if(typeof d === 'object') {
      const
          html = ['<table>'],
          keys = Object.keys(d).sort();
      for(let i = 0; i < keys.length; i++) {
        html.push(this.differenceAsTableRow(d, keys[i]));
      }
      html.push('</table>');
      return html.join('\n');
    }
    return '';
  }

} // END of class DocumentationManager 


// CLASS Finder provides the finder dialog functionality
class Finder {
  constructor() {
    this.dialog = UI.draggableDialog('finder');
    UI.resizableDialog('finder', 'FINDER');
    this.close_btn = document.getElementById('finder-close-btn');
    // Make toolbar buttons responsive
    this.close_btn.addEventListener('click', (e) => UI.toggleDialog(e));
    this.entities = [];
    this.filter_input = document.getElementById('finder-filter-text');
    this.filter_input.addEventListener('input', () => FINDER.changeFilter());
    this.copy_btn = document.getElementById('finder-copy-btn');
    this.copy_btn.addEventListener(
        'click', (event) => FINDER.copyAttributesToClipboard(event.shiftKey));

  // Attribute headers are used by Finder to output entity attribute values
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
    // Set own properties
    this.reset();
  }

  reset() {
    this.entities.length = 0;
    this.selected_entity = null;
    this.filter_input.value = '';
    this.filter_pattern = null;
    this.entity_types = VM.entity_letters;
    this.find_links = true;
    this.last_time_clicked = 0;
    this.clicked_object = null;
    // Product cluster index "remembers" for which cluster a product was
    // last revealed, so it can reveal the next cluster when clicked again
    this.product_cluster_index = 0;
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
    // No list unless a pattern OR a specified SUB-set of entity types
    if(fp || et && et !== VM.entity_letters) {
      if(et.indexOf('A') >= 0) {
        imgs += '<img src="images/actor.png">';
        for(let k in MODEL.actors) if(MODEL.actors.hasOwnProperty(k)) {
          if(!fp || patternMatch(MODEL.actors[k].name, this.filter_pattern)) {
            enl.push(k);
            this.entities.push(MODEL.actors[k]);
          }
        }
      }
      // NOTE: do not list black-boxed entities
      if(et.indexOf('P') >= 0) {
        imgs += '<img src="images/process.png">';
        for(let k in MODEL.processes) if(MODEL.processes.hasOwnProperty(k)) {
          if(!k.startsWith(UI.BLACK_BOX) && (!fp || patternMatch(
              MODEL.processes[k].displayName, this.filter_pattern))) {
            enl.push(k);
            this.entities.push(MODEL.processes[k]);
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
          }
        }
      }
      if(et.indexOf('D') >= 0) {
        imgs += '<img src="images/dataset.png">';
        for(let k in MODEL.datasets) if(MODEL.datasets.hasOwnProperty(k)) {
          const ds = MODEL.datasets[k];
          if(!k.startsWith(UI.BLACK_BOX) && (!fp || patternMatch(
              ds.displayName, this.filter_pattern))) {
            // NOTE: do not list the equations dataset
            if(ds !== MODEL.equations_dataset) {
              enl.push(k);
              this.entities.push(MODEL.datasets[k]);
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
            }
          }
        }
      }
      if(et.indexOf('L') >= 0) {
        imgs += '<img src="images/link.png">';
        for(let k in MODEL.links) if(MODEL.links.hasOwnProperty(k)) {
          // NOTE: "black-boxed" link identifiers are not prefixed => other test
          const
              l = MODEL.links[k],
              ldn = l.displayName,
              // A links is "black-boxed" when BOTH nodes are "black-boxed"
              bb = ldn.split(UI.BLACK_BOX).length > 2;
          if(!bb && (!fp || patternMatch(ldn, this.filter_pattern))) {
            enl.push(k);
            this.entities.push(l);
          }
        }
      }
      if(et.indexOf('B') >= 0) {
        imgs += '<img src="images/constraint.png">';
        for(let k in MODEL.constraints) {
          // NOTE: likewise, constraint identifiers can be prefixed by %
          if(MODEL.constraints.hasOwnProperty(k)) {
            if(!k.startsWith(UI.BLACK_BOX) && (!fp || patternMatch(
                MODEL.constraints[k].displayName, this.filter_pattern))) {
              enl.push(k);
              this.entities.push(MODEL.constraints[k]);
            }
          }
        }
      }
      enl.sort();
    }
    document.getElementById('finder-entity-imgs').innerHTML = imgs;
    let seid = 'etr';
    for(let i = 0; i < enl.length; i++) {
      const e = MODEL.objectByID(enl[i]);
      if(e === se) seid += i;
      el.push(['<tr id="etr', i, '" class="dataset',
          (e === se ? ' sel-set' : ''), '" onclick="FINDER.selectEntity(\'',
          enl[i], '\');" onmouseover="FINDER.showInfo(\'', enl[i],
          '\', event.shiftKey);"><td draggable="true" ',
          'ondragstart="FINDER.drag(event);"><img class="finder" src="images/',
          e.type.toLowerCase(), '.png">', e.displayName,
          '</td></tr>'].join(''));
    }
    // NOTE: reset `selected_entity` if not in the new list
    if(seid === 'etr') this.selected_entity = null;
    document.getElementById('finder-table').innerHTML = el.join('');
    UI.scrollIntoView(document.getElementById(seid));
    document.getElementById('finder-count').innerHTML = pluralS(
        el.length, 'entity', 'entities');
    if(el.length > 0) {
      this.copy_btn.style.display = 'block';
    } else {
      this.copy_btn.style.display = 'none';
    }
    this.updateRightPane();
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
      // Make occurrence list
      if(se instanceof Process || se instanceof Cluster) {
        // Processes and clusters "occur" in their parent cluster
        if(se.cluster) occ.push(se.cluster.identifier);
      } else if(se instanceof Product) {
        // Products "occur" in clusters where they have a position
        const cl = se.productPositionClusters;
        for(let i = 0; i < cl.length; i++) {
          occ.push(cl[i].identifier);
        }
      } else if(se instanceof Actor) {
        // Actors "occur" in clusters where they "own" processes or clusters
        for(let k in MODEL.processes) if(MODEL.processes.hasOwnProperty(k)) {
          const p = MODEL.processes[k];
          if(p.actor === se) occ.push(p.identifier);
        }
        for(let k in MODEL.clusters) if(MODEL.clusters.hasOwnProperty(k)) {
          const c = MODEL.clusters[k];
          if(c.actor === se) occ.push(c.identifier);
        }
      } else if(se instanceof Link || se instanceof Constraint) {
        // Links and constraints "occur" in their "best" parent cluster
        const c = MODEL.inferParentCluster(se);
        if(c) occ.push(c.identifier);
      }
      // NOTE: no "occurrence" of datasets or equations
      // @@TO DO: identify MODULES (?)
      // All entities can also occur as chart variables
      for(let j = 0; j < MODEL.charts.length; j++) {
        const c = MODEL.charts[j];
        for(let k = 0; k < c.variables.length; k++) {
          const v = c.variables[k];
          if(v.object === se || (se instanceof DatasetModifier &&
              se.identifier === UI.nameToID(v.attribute))) {
            occ.push(MODEL.chart_id_prefix + j);
            break;
          }
        }
      }
      // Now also look for occurrences of entity references in expressions
      const
          raw = escapeRegex(se.displayName),
          re = new RegExp(
              '\\[\\s*' + raw.replace(/\s+/g, '\\s+') + '\\s*[\\|\\@\\]]');
      // Check actor weight expressions
      for(let k in MODEL.actors) if(MODEL.actors.hasOwnProperty(k)) {
        const a = MODEL.actors[k];
        if(re.test(a.weight.text)) {
          xal.push('W');
          xol.push(a.identifier);
        }
      }
      // Check all process attribute expressions
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
      // Check all product attribute expressions
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
      // Check all notes in clusters for their color expressions and field
      for(let k in MODEL.clusters) if(MODEL.clusters.hasOwnProperty(k)) {
        const c = MODEL.clusters[k];
        for(let i = 0; i < c.notes.length; i++) {
          const n = c.notes[i];
          // Look for entity in both note contents and note color expression
          if(re.test(n.color.text) || re.test(n.contents)) {
            xal.push('NOTE');
            xol.push(n.identifier);
          }
        }
      }
      // Check all link rate expressions
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
      // Check all dataset modifier expressions
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
    for(let i = 0; i < occ.length; i++) {
      const e = MODEL.objectByID(occ[i]);
      el.push(['<tr id="eotr', i, '" class="dataset" onclick="FINDER.reveal(\'',
          occ[i], '\');" onmouseover="FINDER.showInfo(\'',
          occ[i], '\', event.shiftKey);"><td><img class="finder" src="images/',
          e.type.toLowerCase(), '.png">', e.displayName,
          '</td></tr>'].join(''));
    }
    document.getElementById('finder-item-table').innerHTML = el.join('');
    // Clear the table row list
    el.length = 0;
    // Now fill it with entity+attribute having a matching expression
    for(let i = 0; i < xal.length; i++) {
      const
          id = xol[i],
          e = MODEL.objectByID(id),
          attr = (e instanceof Note ? '' : xal[i]);
      let img = e.type.toLowerCase(),
          // NOTE: a small left-pointing triangle denotes that the right-hand
          // part has the left hand part as its attribute
          cs = '',
          td = attr + '</td><td>&#x25C2;</td><td style="width:95%">' +
              e.displayName;
      // NOTE: equations may have LONG names while the equations dataset name
      // is irrelevant, hence use 3 columns (no triangle)
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
    document.getElementById('finder-expression-table').innerHTML = el.join('');
    document.getElementById('finder-expression-hdr').innerHTML =
        pluralS(el.length, 'expression');
  }
  
  drag(ev) {
    // Start dragging the selected entity
    let t = ev.target;
    while(t && t.nodeName !== 'TD') t = t.parentNode;
    ev.dataTransfer.setData('text', MODEL.objectByName(t.innerText).identifier);
    ev.dataTransfer.setDragImage(t, 25, 20);
  }
  
  changeFilter() {
    // Filter expression can start with 1+ entity letters plus `?` to
    // look only for the entity types denoted by these letters
    let ft = this.filter_input.value,
        et = VM.entity_letters;
    if(/^(\*|[ABCDELPQ]+)\?/i.test(ft)) {
      ft = ft.split('?');
      // NOTE: *? denotes "all entity types except constraints"
      et = (ft[0] === '*' ? 'ACDELPQ' : ft[0].toUpperCase());
      ft = ft.slice(1).join('=');
    }
    this.filter_pattern = patternList(ft);
    this.entity_types = et;
    this.updateDialog();
  }
  
  showInfo(id, shift) {
    // Displays documentation for the entity identified by `id`
    const e = MODEL.objectByID(id);
    if(e) DOCUMENTATION_MANAGER.update(e, shift);
  }
  
  selectEntity(id) {
    // Looks up entity, selects it in the left pane, and updates the right pane
    this.selected_entity = MODEL.objectByID(id);
    this.updateDialog();
  }
  
  reveal(id) {
    // Shows selected occurrence
    const
        se = this.selected_entity,
        obj = (se ? MODEL.objectByID(id) : null);
    if(!obj) console.log('Cannot reveal ID', id);
    // If cluster, make it focal...
    if(obj instanceof Cluster) {
      UI.makeFocalCluster(obj);
      // ... and select the entity unless it is an actor or dataset
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
      // ... and select it
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
      // If occurrence is a chart, select and show it in the chart manager
      CHART_MANAGER.chart_index = MODEL.charts.indexOf(obj);
      if(CHART_MANAGER.chart_index >= 0) {
        if(UI.hidden('chart-dlg')) {
          UI.buttons.chart.dispatchEvent(new Event('click'));
        }
      }
      CHART_MANAGER.updateDialog();
    }
    // NOTE: return the object to save a second lookup by revealExpression
    return obj;
  }

  revealExpression(id, attr, shift=false, alt=false) {
    const
        obj = this.reveal(id),
        now = Date.now(),
        dt = now - this.last_time_clicked;
    this.last_time_clicked = now;
    if(obj === this.clicked_object) {
      // Consider click to be "double" if it occurred less than 300 ms ago
      if(dt < 300) {
        this.last_time_clicked = 0;
        shift = true;
      }
    }
    this.clicked_object = obj;
    if(obj && attr && (shift || alt)) {
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
  
  copyAttributesToClipboard(shift) {
    // Copy relevant entity attributes as tab-separated text to clipboard
    // NOTE: all entity types have "get" `attributes` that returns an object
    // that for each defined attribute (and if model has been solved also each
    // inferred attribute) has a property with its value. For dynamic
    // expressions, the expression text is used
    const ea_dict = {A: [], B: [], C: [], D: [], E: [], L: [], P: [], Q: []};
    let e = this.selected_entity;
    if(shift && e) {
      ea_dict[e.typeLetter].push(e.attributes);
    } else {
      for(let i = 0; i < this.entities.length; i++) {
        e = this.entities[i];
        ea_dict[e.typeLetter].push(e.attributes);
      }
    }
    const
      seq = ['A', 'B', 'C', 'D', 'E', 'P', 'Q', 'L'],
      text = [],
      attr = [];
    for(let i = 0; i < seq.length; i++) {
      const
          etl = seq[i],
          ead = ea_dict[etl];
      if(ead && ead.length > 0) {
        // No blank line before first entity type
        if(text.length > 0) text.push('');
        let ah = this.attribute_letters[etl];
        if(!MODEL.infer_cost_prices) {
          // No cost price calculation => trim associated attributes from header
          let p = ah.indexOf('\tCost price');
          if(p > 0) {
            ah = ah.substr(0, p);
          } else {
            // SOC is exogenous, and hence comes before F in header => replace
            ah = ah.replace('\tShare of cost', '');
          }
        }
        text.push(ah);
        attr.length = 0;
        for(let i = 0; i < ead.length; i++) {
          const
              ea = ead[i],
              ac = VM.attribute_codes[etl],
              al = [ea.name];
          for(let j = 0; j < ac.length; j++) {
            if(ea.hasOwnProperty(ac[j])) al.push(ea[ac[j]]);
          }
          attr.push(al.join('\t'));
        }
        attr.sort();
        text.push(attr.join('\n'));
      }
    }
    UI.copyStringToClipboard(text.join('\n'));
  }
  
} // END of class Finder


// CLASS GUIReceiver defines a listener/interpreter for commands from local host
class GUIReceiver {
  constructor() {
    this.channel_modal = new ModalDialog('channel');
    this.channel_modal.ok.addEventListener('click',
        () => RECEIVER.activate());
    this.channel_modal.cancel.addEventListener('click',
        () => RECEIVER.channel_modal.hide());
    this.channel_modal.element('path').title =
        'URL a of public channel, or path to a directory on local host\n' +
        `(use shorthand @ for ${PUBLIC_LINNY_R_URL}/channel/)`;
    this.channel_modal.element('callback').title =
        'Path to Linny-R command file\n' +
        '(default path: (main)/command/; default extension: .lrc)';
    // NOTE: each receiver instance listens to a "channel", being the directory
    // on the local host specified by the modeler
    this.channel = '';
    // The file name is the name of the first Linny-R model file or command file
    // that was found in the channel directory
    this.file_name = '';
    // The name of the experiment to be run can be specified in a command file
    this.experiment = '';
    // The call-back script is the path (on the local host) to the Python script
    // that is to be executed after a successful run
    this.call_back_script = '';
    this.active = false;
    this.solving = false;
    this.interval = 1000;
    this.error = '';
    this.log_lines = [];
    // NOTE: hide receiver button unless on a local server (127.0.0.1)
    if(window.location.href.indexOf('/127.0.0.1') < 0) {
      UI.buttons.receiver.classList.add('off');
    }
  }
  
  setError(msg) {
    // Record and display error message, and immediately stop listening
    this.error = msg;
    UI.warn(this.error);
    this.deactivate();
  }
  
  log(msg) {
    // Logs a message displayed on the status line while solving
    if(this.active) {
      if(!msg.startsWith('[')) {
        const
            d = new Date(),
            now = d.getHours() + ':' +
                d.getMinutes().toString().padStart(2, '0') + ':' +
                d.getSeconds().toString().padStart(2, '0');
        msg = `[${now}] ${msg}`;
      }
      this.log_lines.push(msg);
    }
  }
  
  get logReport() {
    // Returns log lines as a single string, and clears the log
    const report = this.log_lines.join('\n');
    this.log_lines.length = 0;
    return report;
  }

  activate() {
    // Sets channel path and (optional) call-back script
    this.channel = this.channel_modal.element('path').value.trim();
    this.call_back_script = this.channel_modal.element('callback').value.trim();
    // Default channel is the `channel` sub-directory
    if(this.channel === '') this.channel = 'channel';
    // Clear experiment, error message and log
    this.experiment = '';
    this.error = '';
    this.log_lines.length = 0;
    this.active = true;
    this.listen();
    UI.buttons.receiver.classList.add('blink');
    UI.notify(`Started listening at <tt>${this.channel}</tt>`);
    this.channel_modal.hide();
  }
  
  deactivate() {
    // Stops the receiver from listening at the channel
    this.active = false;
    UI.buttons.receiver.classList.remove('blink');
  }
  
  toggle() {
    // Responds to receiver ON/OFF button at top bar
    if(this.active) {
      this.deactivate();
      // NOTE: only notify when the modeler deactivates, so as to prevent
      // overwriting error messages on the status line
      UI.notify(`Stopped listening at <tt>${this.channel}</tt>`);
    } else {
      // Show channel dialog
      this.channel_modal.element('path').value = this.channel;
      this.channel_modal.element('callback').value = this.call_back_script;
      this.channel_modal.show('path');
    }
  }
  
  listen() {
    // If active, checks with local server whether there is a new command
    if(!this.active) return;
    fetch('receiver/', postData({path: this.channel, action: 'listen'}))
      .then((response) => {
          if(!response.ok) {
            UI.alert(`ERROR ${response.status}: ${response.statusText}`);
          }
          return response.text();
        })
      .then((data) => {
          if(UI.postResponseOK(data)) {
            let jsr;
            try {
              jsr = JSON.parse(data);
            } catch(err) {
              console.log('ERROR while parsing JSON:', err);
              RECEIVER.setError('SERVER ERROR: ' + data.slice(0, 250));
              return;
            }
            if(jsr.stop) {
              UI.notify('Receiver deactivated by script');
              RECEIVER.deactivate();
            } else if(jsr.file === '') {
              // Nothing to do => check again after the set time interval
              setTimeout(() => RECEIVER.listen(), RECEIVER.interval);
              return;
            } else if(jsr.file && jsr.model) {
              RECEIVER.file_name = jsr.file;
              let msg = '';
              if(!UI.loadModelFromXML(jsr.model)) {
                msg = 'ERROR: Received model is not valid';
              } else if(jsr.experiment) {
                EXPERIMENT_MANAGER.selectExperiment(jsr.experiment);
                if(!EXPERIMENT_MANAGER.selected_experiment) {
                  msg = `ERROR: Unknown experiment "${jsr.experiment}"`;
                } else {
                  RECEIVER.experiment = jsr.experiment;
                }
              }
              if(msg) {
                RECEIVER.setError(msg);
                // Record abort on local host
                fetch('receiver/', postData({
                      path: RECEIVER.channel,
                      file: RECEIVER.file_name,
                      action: 'abort',
                      log: RECEIVER.logReport
                    }))
                  .then((response) => {
                      if(!response.ok) {
                        UI.alert(
                            `ERROR ${response.status}: ${response.statusText}`);
                      }
                      return response.text();
                    })
                  .then((data) => {
                      // Always show response on status line
                      UI.postResponseOK(data, true);
                      // Keep listening, so check again after the time interval
                      setTimeout(() => RECEIVER.listen(), RECEIVER.interval);
                    })
                  .catch(() => UI.warn(UI.WARNING.NO_CONNECTION, err));
              } else {
                RECEIVER.log('Executing: ' + RECEIVER.file_name);
                // NOTE: Virtual Machine will trigger the receiver's reporting
                // action each time the model has been solved
                if(RECEIVER.experiment) {
                  RECEIVER.log('Starting experiment: ' + RECEIVER.experiment);
                  EXPERIMENT_MANAGER.startExperiment();
                } else {
                  VM.solveModel();
                }
              }
            } else {
              RECEIVER.setError('Receiver issue: ' + response);
            }
          }
        })
      .catch(() => UI.warn(UI.WARNING.NO_CONNECTION, err));
  }

  report() {
    // Posts the run results to the local server, or signals an error
    let form,
        run = '';
    // NOTE: Always set `solving` to FALSE
    this.solving = false;
    if(this.experiment){
      if(MODEL.running_experiment) {
        run = MODEL.running_experiment.active_combination_index;
        this.log(`Reporting: ${this.file_name} (run #${run})`);
      }
    }
    if(MODEL.solved && !VM.halted) {
      // Normal execution termination => report results
      const od = MODEL.outputData;
      form = {
          path: this.channel,
          file: this.file_name,
          action: 'report',
          run: run,
          data: od[0],
          stats: od[1],
          log: RECEIVER.logReport
        };
    } else {
      if(!VM.halted && !this.error) {
        // No apparent cause => log this irregularity
        this.setError('ERROR: Unknown solver problem');
      }
      form = {
          path: this.channel,
          file: this.file_name,
          action: 'abort',
          log: this.logReport
        };
    }
    fetch('receiver/', postData(form))
      .then((response) => {
          if(!response.ok) {
            UI.alert(`ERROR ${response.status}: ${response.statusText}`);
          }
          return response.text();
        })
      .then((data) => {
          // For experiments, only display server response if warning or error
          UI.postResponseOK(data, !RECEIVER.experiment);
          // If execution completed, perform the call-back action
          // NOTE: for experiments, call-back is performed upon completion by
          // the Experiment Manager
          if(!RECEIVER.experiment) RECEIVER.callBack();
        })
      .catch(() => UI.warn(UI.WARNING.NO_CONNECTION, err));
  }

  callBack() {
    // Deletes the file in the channel directory (to prevent executing it again)
    // and activates the call-back script on the local server
    fetch('receiver/', postData({
          path: this.channel,
          file: this.file_name,
          action: 'call-back',
          script: this.call_back_script
        }))
      .then((response) => {
          if(!response.ok) {
            UI.alert(`ERROR ${response.status}: ${response.statusText}`);
          }
          return response.text();
        })
      .then((data) => {
          // Call-back completed => resume listening unless running experiment
          if(RECEIVER.experiment) {
            // For experiments, only display server response if warning or error
            UI.postResponseOK(data);
          } else {
            // Always show server response for single runs
            if(UI.postResponseOK(data, true)) {
              // NOTE: resume listening only if no error
              setTimeout(() => RECEIVER.listen(), RECEIVER.interval);
            } else {
              RECEIVER.deactivate();
            }
          }
        })
      .catch(() => UI.warn(UI.WARNING.NO_CONNECTION, err));
  }

} // END of class GUIReceiver


// CLASS UndoEdit
class UndoEdit {
  constructor(action) {
    this.action = action;
    // NOTE: store present focal cluster, as modeler may move to other clusters
    // after an edit 
    this.cluster = MODEL.focal_cluster;
    this.object_id = null;
    // NOTE: the properties stored for an edit may differ, depending on the action
    this.properties = [];
    // Undo may involve restoring the `selected` property of selected items
    this.selection = [];
    this.xml = '';
  }
  
  get fullAction() {
    // Returns a string that reflects this edit action
    // If the identifier is set, return the action followed by the class name
    // of the object. NOTE: `obj` should then not be NULL, but check anyway
    if(this.action === 'drop' || this.action == 'lift') {
      return `Move ${pluralS(this.properties.length, 'node')} to cluster ` +
          MODEL.objectByID(this.object_id).displayName;
    } else if(this.action === 'replace') {
      return `Replace ${this.properties.g ? '' : '(locally) '}product \u2018` +
          this.properties.p + '\u2019 by product \u2018' +
          this.properties.r + '\u2019';
    } else if(this.object_id) {
      const
          obj = MODEL.objectByID(this.object_id),
          obt = (obj ? obj.type.toLowerCase() : 'UNKOWN ' + this.object_id);
      return this.action + ' ' + obt;
    // A REDO of "add" has as properties [class name, identifier] of the added object  
    } else if(this.action === 'add' && this.properties.length === 2) {
      return 'add ' + this.properties[0].toLowerCase();
    }
    // By default, return the action without further specification
    return this.action;
  }

  setSelection() {
    // Compile the list of IDs of selected entities
    this.selection.length = 0;
    for(let i = 0; i < MODEL.selection.length; i++) {
      this.selection.push(MODEL.selection[i].identifier);
    }
  }
  
  get getSelection() {
    // Return the list of entities that were selected at the time of the action
    const ol = [];
    for(let i = 0; i < this.selection.length; i++) {
      const obj = MODEL.objectByID(this.selection[i]);
      // Guard against pushing NULL pointers in case object is not found
      if(obj) ol.push(obj);
    }
    return ol;
  }
} // END of class UndoEdit


// CLASS UndoStack
// NOTE: this object actually comprises TWO stacks -- one with undoable actions
// and one with redoable actions
class UndoStack {
  constructor() {
    this.undoables = [];
    this.redoables = [];
    this.clear();
  }
  
  clear() {
    this.undoables.length = 0;
    this.redoables.length = 0;
  }
  
  get topUndo() {
    // Return the short name of the top undoable action (if any)
    const i = this.undoables.length;
    if(i > 0) return this.undoables[i - 1].action;
    return false;    
  }

  get canUndo() {
    // Return the "display name" of the top undoable action (if any)
    const i = this.undoables.length;
    if(i > 0) return `Undo "${this.undoables[i - 1].fullAction}"`;
    return false;
  }
  
  get topRedo() {
    // Return the short name of the top undoable action (if any)
    const i = this.redoables.length;
    if(i > 0) return this.redoables[i - 1].action;
    return false;    
  }

  get canRedo() {
    // Return the "display name" of the top redoable action (if any)
    const i = this.redoables.length;
    if(i > 0) return `Redo "${this.redoables[i - 1].fullAction}"`;
    return false;
  }
  
  addXML(xml) {
    // Insert xml at the start (!) of any XML added previously to the UndoEdit
    // at the top of the UNDO stack
    const i = this.undoables.length;
    if(i === 0) return false;
    this.undoables[i-1].xml = xml + this.undoables[i-1].xml;
  }

  addOffset(dx, dy) {
    // Add (dx, dy) to the offset of the "move" UndoEdit that should be at the
    // top of the UNDO stack
    let i = this.undoables.length;
    if(i === 0) return false;
    this.undoables[i-1].properties[3] += dx;
    this.undoables[i-1].properties[4] += dy;
  }

  push(action, args=null, tentative=false) {
    // Add an UndoEdit to the undo stack, labeled with edit action that is
    // about to be performed. NOTE: the IDs of objects are stored, rather than
    // the objects themselves, because deleted objects will have different
    // memory addresses when restored by an UNDO

    // Any action except "move" is likely to invalidate the solver result
    if(action !== 'move' && !(
      // Exceptions:
      // (1) adding/modifying notes
      (args instanceof Note)
        )) VM.reset();

    // If this edit is new (i.e., not a redo) then remove all "redoable" edits
    if(!tentative) this.redoables.length = 0;
    // If the undo stack is full then discard its bottom edit
    if(this.undoables.length == CONFIGURATION.undo_stack_size) this.undoables.splice(0, 1);
    const ue = new UndoEdit(action);
    // For specific actions, store the IDs of the selected entities
    if(['move', 'delete', 'drop', 'lift'].indexOf(action) >= 0) {
      ue.setSelection();
    }
    // Set the properties of this undoable, depending on the type of action
    if(action === 'move') {
      // `args` holds the dragged node => store its ID and position
      // NOTE: for products, use their ProductPosition in the focal cluster
      const obj = (args instanceof Product ?
          args.positionInFocalCluster : args);
      ue.properties = [args.identifier, obj.x, obj.y, 0, 0];
      // NOTE: object_id is NOT set, as dragged selection may contain
      // multiple entities
    } else if(action === 'add') {
      // `args` holds the added entity => store its ID
      ue.object_id = args.identifier;
    } else if(action === 'drop' || action === 'lift') {
      // Store ID of target cluster
      ue.object_id = args.identifier;
      ue.properties = MODEL.getSelectionPositions;
    } else if(action === 'replace') {
      // Replace passes its undo information as an object
      ue.properties = args;
    }

    // NOTE: for a DELETE action, no properties are stored; the XML needed to
    // restore deleted entities will be added by the respective delete methods

    // Push the new edit onto the UNDO stack
    this.undoables.push(ue);
    // Update the GUI buttons
    UI.updateButtons();
//console.log('push ' + action);
//console.log(UNDO_STACK);
  }

  pop(action='') {
    // Remove the top edit (if any) from the stack if it has the specified action
    // NOTE: pop does NOT undo the action (the model is not modified)
    let i = this.undoables.length - 1;
    if(i >= 0 && (action === '' || this.undoables[i].action === action)) {
      this.undoables.pop();
      UI.updateButtons();
    }
//console.log('pop ' + action);
//console.log(UNDO_STACK);
  }

  doMove(ue) {
    // This method implements shared code for UNDO and REDO of "move" actions
    // First get the dragged node
    let obj = MODEL.objectByID(ue.properties[0]); 
    if(obj) {
      // For products, use the x and y of the ProductPosition
      if(obj instanceof Product) obj = obj.positionInFocalCluster;
      // Calculate the relative move (dx, dy)
      const
          dx = ue.properties[1] - obj.x,
          dy = ue.properties[2] - obj.y,
          tdx = -ue.properties[3],
          tdy = -ue.properties[4];
      // Update the undo edit's x and y properties so that it can be pushed onto
      // the other stack (as the dragged node ID and the selection stays the same)
      ue.properties[1] = obj.x;
      ue.properties[2] = obj.y;
      // Prepare to translate back (NOTE: this will also prepare for REDO)
      ue.properties[3] = tdx;
      ue.properties[4] = tdy;
      // Translate the entire graph (NOTE: this does nothing if dx and dy both equal 0)
      MODEL.translateGraph(tdx, tdy);
      // Restore the selection as it was at the time of the "move" action
      MODEL.selectList(ue.getSelection);
      // Move the selection back to its original position
      MODEL.moveSelection(dx - tdx, dy - tdy);
    }
  }
  
  restoreFromXML(xml) {
    // Restore deleted objects from XML and add them to the UndoEdit's selection
    // (so that they can be RE-deleted)
    // NOTES:
    // (1) Store focal cluster, because this may change while initializing a
    //     cluster from XML
    // (2) Set "selected" attribute of objects to FALSE, as the selection will
    //     be restored from UndoEdit
    const n = parseXML(MODEL.xml_header + `<edits>${xml}</edits>`);
    if(n && n.childNodes) {
      let c, li = [], ppi = [], ci = [];  
      for(let i = 0; i < n.childNodes.length; i++) {
        c = n.childNodes[i];
      // Immediately restore "independent" entities ...
        if(c.nodeName === 'dataset') {
          MODEL.addDataset(xmlDecoded(nodeContentByTag(c, 'name')), c);
        } else if(c.nodeName === 'actor') {
          MODEL.addActor(xmlDecoded(nodeContentByTag(c, 'name')), c);
        } else if(c.nodeName === 'note') {
          const obj = MODEL.addNote(c);
          obj.selected = false;
        } else if(c.nodeName === 'process') {
          const obj = MODEL.addProcess(xmlDecoded(nodeContentByTag(c, 'name')),
            xmlDecoded(nodeContentByTag(c, 'owner')), c);
          obj.selected = false;
        } else if(c.nodeName === 'product') {
          const obj = MODEL.addProduct(
            xmlDecoded(nodeContentByTag(c, 'name')), c);
          obj.selected = false;
        } else if(c.nodeName === 'chart') {
          MODEL.addChart(xmlDecoded(nodeContentByTag(c, 'title')), c);
        // ... but merely collect indices of other entities
        } else if(c.nodeName === 'link' || c.nodeName === 'constraint') {
          li.push(i);
        } else if(c.nodeName === 'product-position') {
          ppi.push(i);
        } else if(c.nodeName === 'cluster') {
          ci.push(i);
        }
      }
      // NOTE: collecting the indices of links, product positions and clusters
      // saves the effort to iterate over ALL childnodes again
      // First restore links and constraints
      for(let i = 0; i < li.length; i++) {
        c = n.childNodes[li[i]];
        // Double-check that this node defines a link or a constraint
        if(c.nodeName === 'link' || c.nodeName === 'constraint') {
          let name = xmlDecoded(nodeContentByTag(c, 'from-name'));
          let actor = xmlDecoded(nodeContentByTag(c, 'from-owner'));
          if(actor != UI.NO_ACTOR) name += ` (${actor})`;
          let fn = MODEL.nodeBoxByID(UI.nameToID(name));
          if(fn) {
            name = xmlDecoded(nodeContentByTag(c, 'to-name'));
            actor = xmlDecoded(nodeContentByTag(c, 'to-owner'));
            if(actor != UI.NO_ACTOR) name += ` (${actor})`;
            let tn = MODEL.nodeBoxByID(UI.nameToID(name));
            if(tn) {
              if(c.nodeName === 'link') {
                MODEL.addLink(fn, tn, c).selected = false;
              } else {
                MODEL.addConstraint(fn, tn, c).selected = false;
              }
            }
          }
        }
      }
      // Then restore product positions.
      // NOTE: These correspond to the products that were part of the
      // selection; all other product positions are restored as part of their
      // containing clusters
      for(let i = 0; i < ppi.length; i++) {
        c = n.childNodes[ppi[i]];
        // Double-check that this node defines a product position
        if(c.nodeName === 'product-position') {
          const obj = MODEL.nodeBoxByID(UI.nameToID(
            xmlDecoded(nodeContentByTag(c, 'product-name'))));
          if(obj) {
            obj.selected = false;
            MODEL.focal_cluster.addProductPosition(obj).initFromXML(c);
          }
        }
      }
      // Lastly, restore clusters.
      // NOTE: Store focal cluster, because this may change while initializing
      // a cluster from XML
      const fc = MODEL.focal_cluster;
      for(let i = 0; i < ci.length; i++) {
        c = n.childNodes[ci[i]];
        if(c.nodeName === 'cluster') {
          const obj = MODEL.addCluster(xmlDecoded(nodeContentByTag(c, 'name')),
            xmlDecoded(nodeContentByTag(c, 'owner')), c);
          obj.selected = false;

// TEMPORARY trace (remove when done testing)
if (MODEL.focal_cluster === fc) {
  console.log('NO refocus needed');
} else {
  console.log('Refocusing from ... to ... : ', MODEL.focal_cluster, fc);
}
          // Restore original focal cluster because addCluster may shift focus
          // to a sub-cluster
          MODEL.focal_cluster = fc;
        }
      }
    }
    MODEL.clearSelection();
  }
  
  undo() {
    // Undo the most recent "undoable" action
    let ue;
    if(this.undoables.length > 0) {
      UI.reset();
      // Get the action to be undone
      ue = this.undoables.pop();
      // Focus on the cluster that was focal at the time of action
      // NOTE: do this WITHOUT calling UI.makeFocalCluster because this
      // clears the selection and redraws the graph
      MODEL.focal_cluster = ue.cluster;
//console.log('undo' + ue.fullAction);
//console.log(ue);
      if(ue.action === 'move') {
        this.doMove(ue);
        // NOTE: doMove modifies the undo edit so that it can be used as redo edit
        this.redoables.push(ue);
      } else if(ue.action === 'add') {
        // UNDO add means deleting the lastly added entity
        let obj = MODEL.objectByID(ue.object_id);
        if(obj) {
          // Prepare UndoEdit for redo
          const ot = obj.type;
          // Set properties to [class name, identifier] (for tooltip display and redo)
          ue.properties = [ot, ue.object_id];
          // NOTE: `action` remains "add", but ID is set to null because otherwise
          // the fullAction method would fail
          ue.object_id = null;
          // Push the "delete" UndoEdit back onto the undo stack so that XML will
          // be added to it
          this.undoables.push(ue);
          // Mimic the exact selection state immediately after adding the entity
          MODEL.clearSelection();
          MODEL.select(obj);
          // Execute the proper delete, depending on the type of entity
          if(ot === 'Link') {
            MODEL.deleteLink(obj);
          } else if(ot === 'Note') {
            MODEL.focal_cluster.deleteNote(obj);
          } else if(ot === 'Cluster') {
            MODEL.deleteCluster(obj);
          } else if(ot === 'Product') {
            // NOTE: `deleteProduct` deletes the ProductPosition, and the product
            // itself only if needed 
            MODEL.focal_cluster.deleteProduct(obj);
          } else if(ot === 'Process') {
            MODEL.deleteNode(obj);
          }
          // Clear the model's selection, since we've bypassed the regular
          // `deleteSelection` routine
          MODEL.selection.length = 0;
          // Move the UndoEdit to the redo stack
          this.redoables.push(this.undoables.pop());
        }
      } else if(ue.action === 'delete') {
        this.restoreFromXML(ue.xml);
        // Restore the selection as it was at the time of the "delete" action
        MODEL.selectList(ue.getSelection);
        // Clear the XML (not useful for REDO delete)
        ue.xml = null;   
        this.redoables.push(ue);
      } else if(ue.action === 'drop' || ue.action === 'lift') {
        // Restore the selection as it was at the time of the action
        MODEL.selectList(ue.getSelection);
        // NOTE: first focus on the original target cluster
        MODEL.focal_cluster = MODEL.objectByID(ue.object_id);
        // Drop the selection "back" to the focal cluster
        MODEL.dropSelectionIntoCluster(ue.cluster);
        // Refocus on the original focal cluster
        MODEL.focal_cluster = ue.cluster;
        // NOTE: now restore the selection in THIS cluster!
        MODEL.selectList(ue.getSelection);
        // Now restore the position of the nodes
        MODEL.setSelectionPositions(ue.properties);
        this.redoables.push(ue);
        // NOTE: a drop action will always be preceded by a move action 
        if(ue.action === 'drop') {
          // Double-check, and if so, undo this move as well
          if(this.topUndo === 'move') this.undo();
        }
      } else if(ue.action === 'replace') {
        let uep = ue.properties,
            p = MODEL.objectByName(uep.p);
        // First check whether product P needs to be restored
        if(!p && ue.xml) {
          const n = parseXML(MODEL.xml_header + `<edits>${ue.xml}</edits>`);
          if(n && n.childNodes) {
            let c = n.childNodes[0];
            if(c.nodeName === 'product') {
              p = MODEL.addProduct(
                  xmlDecoded(nodeContentByTag(c, 'name')), c);
              p.selected = false;
            }
          }
        }
        if(p) {
          // Restore product position of P in focal cluster
          MODEL.focal_cluster.addProductPosition(p, uep.x, uep.y);
          // Restore links in/out of P
          for(let i = 0; i < uep.lt.length; i++) {
            const l = MODEL.linkByID(uep.lt[i]);
            if(l) {
              const ml = MODEL.addLink(l.from_node, p);
              ml.copyPropertiesFrom(l);
              MODEL.deleteLink(l);
            }
          }
          for(let i = 0; i < uep.lf.length; i++) {
            const l = MODEL.linkByID(uep.lf[i]);
            if(l) {
              const ml = MODEL.addLink(p, l.to_node);
              ml.copyPropertiesFrom(l);
              MODEL.deleteLink(l);
            }
          }
          // Restore constraints on/by P
          for(let i = 0; i < uep.ct.length; i++) {
            const c = MODEL.constraintByID(uep.ct[i]);
            if(c) {
              const mc = MODEL.addConstraint(c.from_node, p);
              mc.copyPropertiesFrom(c);
              MODEL.deleteConstraint(c);
            }
          }
          for(let i = 0; i < uep.cf.length; i++) {
            const c = MODEL.constraintByID(uep.cf[i]);
            if(c) c.fromNode = p;
            if(c) {
              const mc = MODEL.addConstraint(p, c.to_node);
              mc.copyPropertiesFrom(c);
              MODEL.deleteConstraint(c);
            }
          }
          // NOTE: same UndoEdit object can be used for REDO
          this.redoables.push(ue);
        } else {
          throw 'Failed to UNDO replace action';
        }
      }
      // Update the main window
      MODEL.focal_cluster.clearAllProcesses();
      UI.drawDiagram(MODEL);
      UI.updateButtons();
    }
//console.log('undo');
//console.log(UNDO_STACK);
  }

  redo() {
    // Restore the model to its state prior to the last undo
    if(this.redoables.length > 0) {
      UI.reset();
      let re = this.redoables.pop();
//console.log('redo ' + re.fullAction);
//console.log(UNDO_STACK);
      // Focus on the cluster that was focal at the time of action
      // NOTE: no call to UI.makeFocalCluster because this clears the selection
      // and redraws the graph
      MODEL.focal_cluster = re.cluster;
      if(re.action === 'move') {
        // NOTE: this is a mirror operation of the UNDO
        this.doMove(re);
        // NOTE: doMove modifies the RedoEdit so that it can be used as UndoEdit
        this.undoables.push(re);
        // NOTE: when next redoable action is "drop", redo this as well
        if(this.topRedo === 'drop') this.redo();
      } else if(re.action === 'add') {
//console.log('ADD redo properties:', re.properties);
        // NOTE: redo an undone "add" => mimick undoing a "delete"
        this.restoreFromXML(re.xml);
        // Clear the XML and restore the object identifier  
        re.xml = null;
        re.object_id = re.properties[1];
        this.undoables.push(re);
      } else if(re.action === 'delete') {
        // Restore the selection as it was at the time of the "delete" action
        MODEL.selectList(re.getSelection);
        this.undoables.push(re);
        // Then perform a delete action
        MODEL.deleteSelection();
      } else if(re.action === 'drop' || re.action === 'lift') {
        const c = MODEL.objectByID(re.object_id);
        if(c instanceof Cluster) MODEL.dropSelectionIntoCluster(c);
      } else if(re.action === 'replace') {
        const
            p = MODEL.objectByName(re.properties.p),
            r = MODEL.objectByName(re.properties.r);
        if(p instanceof Product && r instanceof Product) {
          MODEL.doReplace(p, r, re.properties.g);
        }
      }
      MODEL.focal_cluster.clearAllProcesses();
      UI.drawDiagram(MODEL);
      UI.updateButtons();
    } 
  }
} // END of class UndoStack
