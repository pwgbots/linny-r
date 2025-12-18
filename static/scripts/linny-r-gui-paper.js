/*
Linny-R is an executable graphical specification language for (mixed integer)
linear programming (MILP) problems, especially unit commitment problems (UCP).
The Linny-R language and tool have been developed by Pieter Bots at Delft
University of Technology, starting in 2009. The project to develop a browser-
based version started in 2017. See https://linny-r.org for more information.

This JavaScript file (linny-r-gui-paper.js) provides the SVG diagram-drawing
functionality for the Linny-R model editor.

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
    for(const l of lines) {
      const ts = UI.paper.newSVGElement('tspan');
      ts.setAttribute('x', x);
      ts.setAttribute('dy', fh);
      // NOTE: Non-breaking space must now (inside a TSPAN) be converted
      // to normal spaces, or they will be rendered as '&nbsp;' and this
      // will cause the SVG to break when it is inserted as picture into
      // an MS Word document.
      ts.textContent = l.replaceAll('\u00A0', ' ');
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
      // ... and different shades of green if within or on their bounds.
      neg_within_bounds: '#e0ffb0',
      pos_within_bounds: '#b0ffe0',
      zero_within_bounds: '#c8ffc8',
      neg_within_bounds_font: '#804000',
      pos_within_bounds_font: '#005090',
      within_bounds_font: '#007000',
      // Product are filled in darker green shades...
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
      // Process with unbound level: +INF marine-blue, -INF maroon-red
      plus_infinite_level: '#1000a0',
      minus_infinite_level: '#a00010',
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
  
  get opaqueSVG() {
    // Return SVG as string with nodes and arrows 100% opaque.
    // NOTE: The semi-transparent ovals behind rates on links have
    // opacity 0.8 and hence are not affected.
    return this.svg.outerHTML.replaceAll(' opacity="0.9"', ' opacity="1"');
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
    id = 'i_g_n_o_r_e__t_r_i_a_n_g_l_e__t_i_p__ID';
    this.ignore_triangle = `url(#${id})`;
    this.addMarker(defs, id, tri, 8, this.palette.ignore);
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
    this.addShadowFilter(defs, id, 'rgb(64,160,255)', 2);
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
    // Clear all sub-nodes of the specified SVG node.
    if(el) while(el.lastChild) el.removeChild(el.lastChild);
  }
  
  addSVGAttributes(el, obj) {
    // Add attributes specified by `obj` to (SVG) element `el`.
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
    // Returns the boundingbox {width: ..., height: ...} of a numeric
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
    // special values.
    if(ns === '\u2047') {
      w = 8; // undefined (??)
    } else if(ns === '\u25A6' || ns === '\u2BBF' || ns === '\u26A0') {
      w = 6; // computing, not computed, warning sign
    } else {
      // Assume that number has been rendered with fixed spacing
      // (cf. addNumber method of class Shape).
      w = ns.length * fw;
      // Decimal point and minus sign are narrower.
      if(ns.indexOf('.') >= 0) w -= 0.6 * fw;
      if(ns.startsWith('-')) w -= 0.55 * fw;
      // Add approximate extra length for =, % and special Unicode characters.
      if(ns.indexOf('=') >= 0) {
        w += 0.2 * fw;
      } else {
        // LE, GE, undefined (??), or INF are a bit wider.
        m = ns.match(/%|\u2264|\u2265|\u2047|\u221E/g);
        if(m) {
          w += m.length * 0.25 * fw;
        }
        // Ellipsis (may occur between process bounds) is much wider.
        m = ns.match(/\u2026/g);
        if(m) w += m.length * 0.6 * fw;
      }
    }
    // Adjust for font weight.
    return {width: w * this.weight_factors[Math.round(fweight / 100)],
        height: fh};
  }
  
  textSize(string, fsize=8, fweight=400) {
    // Return the boundingbox {width: ..., height: ...} of a string (in pixels). 
    // NOTE: Uses the invisible SVG element that is defined specifically
    // for text size computation.
    // NOTE: Text size calculation tends to slightly underestimate the
    // length of the string as it is actually rendered, as font sizes
    // appear to be rounded to the nearest available size.
    const el = this.getSizingElement();
    // Accept numbers and strings as font sizes -- NOTE: fractions are ignored!
    el.style.fontSize = parseInt(fsize) + 'px';
    el.style.fontWeight = fweight;
    el.style.fontFamily = this.font_name;
    let w = 0,
        h = 0;
    // Consider the separate lines of the string.
    // NOTE: Add '' to force conversion to string in case `string` is a number.
    const lines = ('' + string).split('\n');
    for(const l of lines) {
      el.textContent = l;
      const bb = el.getBBox();
      w = Math.max(w, bb.width);
      h += bb.height;
    }
    return {width: w, height: h};
  }
  
  removeInvisibleSVG() {
    // Remove SVG elements used by the user interface (not part of the model).
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

  fitToSize(margin=30) {
    // Adjust the dimensions of the main SVG to fit the graph plus 15px margin
    // all around
    this.removeInvisibleSVG();
    const
        bb = this.svg.getBBox(),
        w = bb.width + margin,
        h = bb.height + margin;
    if(w !== this.width || h !== this.height) {
      MODEL.translateGraph(-bb.x + margin / 2, -bb.y + margin);
      this.width = w;
      this.height = h;
      this.svg.setAttribute('width', this.width);
      this.svg.setAttribute('height', this.height);
      this.zoom_factor = 1;
      this.zoom_label.innerHTML = Math.round(100 / this.zoom_factor) + '%';
      this.extend(margin);
    }
  }

  extend(margin=30) {
    // Adjust the paper size to fit all objects WITHOUT changing the origin (0, 0)
    // NOTE: keep a minimum page size to keep the scrolling more "natural"
    this.removeInvisibleSVG();
    const
        bb = this.svg.getBBox(),
        // Let `w` and `h` be the actual width and height in pixels
        w = bb.x + bb.width + margin,
        h = bb.y + bb.height + margin,
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
    // near-zero; then it returns the absolute difference n1 - n2.
    const div = Math.abs(n2);
    // NOTE: Return 0 when n1 and n2 both are near-zero.
    if(div < VM.ON_OFF_THRESHOLD && Math.abs(n1) < VM.ON_OFF_THRESHOLD) return 0;
    if(div < VM.NEAR_ZERO) {
      return n1 - n2;
    }
    return (n1 - n2) / div;
  }
  
  //
  // Diagram-drawing method draws the diagram for the focal cluster.
  //
  
  drawModel(mdl) {
    // Draw the diagram for the focal cluster.
    this.clear();
    // Prepare to draw all elements in the focal cluster.
    const fc = mdl.focal_cluster;
    fc.categorizeEntities();
    // NOTE: Product positions must be updated before links are drawn, so
    // that links arrows will be drawn over their shapes.
    fc.positionProducts();
    for(const p of fc.processes) p.clearHiddenIO();
    for(const c of fc.sub_clusters) c.clearHiddenIO();
    // NOTE: Also ensure that notes will update their fields.
    fc.resetNoteFields();
    // Draw link arrows and constraints first, as all other entities are
    // slightly transparent so they cannot completely hide these lines.
    for(const a of fc.arrows) this.drawArrow(a);
    for(const c of fc.related_constraints) this.drawConstraint(c);
    for(const p of fc.processes) this.drawProcess(p);
    for(const pp of fc.product_positions) this.drawProduct(pp.product);
    for(const c of fc.sub_clusters) this.drawCluster(c);
    // Draw notes last, as they are semi-transparent (and can be quite small).
    for(const n of fc.notes) this.drawNote(n);
    // Resize paper if necessary.
    this.extend();
    // Display model name in browser.
    document.title = mdl.nameWithoutPath || 'Linny-R';
  }
  
  drawSelection(mdl, dx=0, dy=0) {
    // NOTE: Clear this global, as Bezier curves move from under the cursor
    // without a mouseout event.
    this.constraint_under_cursor = null;
    // Draw the selected entities and associated links, and also constraints.
    for(const obj of mdl.selection) {
      // Links and constraints are drawn separately, so do not draw those
      // contained in the selection.
      if(!(obj instanceof Link || obj instanceof Constraint)) {
        if(obj instanceof Note) obj.parsed = false;
        UI.drawObject(obj, dx, dy);
      }
    }
    if(mdl.selection_related_arrows.length === 0) {
      mdl.selection_related_arrows = mdl.focal_cluster.selectedArrows();
    }
    // Only draw the arrows that relate to the selection.
    for(const a of mdl.selection_related_arrows) this.drawArrow(a);
    // As they typically are few, simply redraw all constraints that relate to
    // the focal cluster.
    for(const c of mdl.focal_cluster.related_constraints) this.drawConstraint(c);
    this.extend(); 
  }

  //
  // Shape-drawing methods for model entities
  //

  drawArrow(arrw, dx=0, dy=0) {
    // Draw an arrow from FROM nodebox to TO nodebox.
    // NOTE: First erase previously drawn arrow.
    arrw.shape.clear();
    arrw.hidden_nodes.length = 0;
    // Use local variables so as not to change any "real" attribute values.
    let cnb, proc, prod, fnx, fny, fnw, fnh, tnx, tny, tnw, tnh,
        cp, rr, aa, bb, dd, nn, af, l, s, w, tw, th, bpx, bpy, epx, epy,
        sda, stroke_color, stroke_width, arrow_start, arrow_end,
        font_color, font_weight, luc = null, grid = null;
    // Get the main arrow attributes.
    const
        from_nb = arrw.from_node,
        to_nb = arrw.to_node;
    // Use "let" because `ignored` may also be set later on (for single link).
    let ignored = (from_nb && MODEL.ignored_entities[from_nb.identifier]) ||
        (to_nb && MODEL.ignored_entities[to_nb.identifier]);
    // First check if this is a block arrow (ONE node being null).
    if(!from_nb) {
      cnb = to_nb;
    } else if(!to_nb) {
      cnb = from_nb;
    } else {
      cnb = null;
    }
    // If not NULL, `cnb` is the cluster or node box (product or process) having
    // links to entities outside the focal cluster. Such links are summarized
    // by "block arrows": on the left edge of the box to indicate inflows,
    // on the right edge to indicate outflows, and two-headed on the top edge
    // to indicate two-way flows. When the cursor is moved over a block arrow,
    // the Documentation dialog will display the list of associated nodes
    // (with their actual flows if non-zero).
    if(cnb) {
      // Distinguish between input, output and io products.
      let ip = [], op = [], iop = [];
      if(cnb instanceof Cluster) {
        for(const lnk of arrw.links) {
          // Determine which product is involved.
          prod = (lnk.from_node instanceof Product ? lnk.from_node : lnk.to_node);
          // NOTE: Clusters "know" their input/output products.
          if(cnb.io_products.indexOf(prod) >= 0) {
            addDistinct(prod, iop);
          } else if(cnb.consumed_products.indexOf(prod) >= 0) {
            addDistinct(prod, ip);
          } else if(cnb.produced_products.indexOf(prod) >= 0) {
            addDistinct(prod, op);
          }
        }
      } else {
        // `cnb` is process or product => knows its inputs and outputs.
        for(const lnk of arrw.links) {
          if(lnk.from_node === cnb) {
            addDistinct(lnk.to_node, op);
          } else {
            addDistinct(lnk.from_node, ip);
          }
          // NOTE: For processes, products cannot be BOTH input and output.
        }
      }
      cnb.hidden_inputs = ip;
      cnb.hidden_outputs = op;
      cnb.hidden_io = iop;
      return true;
    } // end of IF "block arrow"
    
    // Arrows having both "from" and "to" are displayed as "real" arrows
    // The hidden nodes list must contain the nodes that have no position
    // in the cluster being drawn.
    // NOTE: Products are "hidden" typically when this arrow represents multiple
    // links, but also if it is a single link from a cluster to a process.
    const
        from_c = from_nb instanceof Cluster,
        to_c = to_nb instanceof Cluster,
        from_p = from_nb instanceof Process,
        to_p = to_nb instanceof Process;
    let data_flows = 0;
    if(arrw.links.length > 1 || (from_c && to_p) || (from_p && to_c)) {
      for(const lnk of arrw.links) {
        const
            fn = lnk.from_node,
            tn = lnk.to_node;
        if(fn instanceof Product && fn != from_nb && fn != to_nb) {
          // Add node only if they not already shown at EITHER end of the arrow.
          addDistinct(fn, arrw.hidden_nodes);
          // Count number of data flows represented by arrow.
          if(tn.is_data) data_flows++;
        }
        // NOTE: No ELSE IF, because BOTH link nodes can be products.
        if(tn instanceof Product && tn != from_nb && tn != to_nb)  {
          addDistinct(tn, arrw.hidden_nodes);
          // Count number of data flows represented by arrow
          if(fn.is_data) data_flows++;
        }
      }
    }

    // NEXT: Some more local variables.
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
    
    // Do not draw arrow if so short that it is hidden by its FROM and TO nodes.
    if((Math.abs(fnx - tnx) < (fnw + tnw)/2) &&
       (Math.abs(fny - tny) <= (fnh + tnh)/2)) {
      return false;
    }
    
    // Adjust node heights if nodes are thick-rimmed.
    if((from_nb instanceof Product) && from_nb.is_buffer) fnh += 2;
    if((to_nb instanceof Product) && to_nb.is_buffer) tnh += 2;
    // Get horizontal distance dx and vertical distance dy of the node centers.
    dx = tnx - fnx;
    dy = tny - fny;
    // If dx is less than half a pixel, draw a vertical line.
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
      // Now dx > 0, so no division by zero can occur when calculating dy/dx.
      // First compute X and Y of tail (FROM node).
      w = (from_nb instanceof Product ? from_nb.frame_width : fnw);
      if(Math.abs(dy / dx) >= Math.abs(fnh / w)) {
        // Arrow connects to horizontal edge.
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
          // link points towards the right.
          arrw.from_x = fnx - nn;
          arrw.from_y = fny - nn * dy / dx;
        } else {
          arrw.from_x = fnx + nn;
          arrw.from_y = fny + nn * dy / dx;
        }
      } else {
        // Rectangular box.
        arrw.from_x = (dx > 0 ? fnx + w/2 : fnx - w/2);
        arrw.from_y = fny + w/2 * dy / Math.abs(dx);
      }
      // Then compute X and Y of head (TO node).
      w = (to_nb instanceof Product ? to_nb.frame_width : tnw);
      dx = arrw.from_x - tnx;
      dy = arrw.from_y - tny;
      if(Math.abs(dx) > 0) {
        if(Math.abs(dy / dx) >= Math.abs(tnh / w)) {
          // Connects to horizontal edge.
          arrw.to_y = (dy > 0 ? tny + tnh/2 : tny - tnh/2);
          arrw.to_x = tnx + tnh/2 * dx / Math.abs(dy);
        } else if(to_nb instanceof Product) {
          // Node with semicircular sides.
          tnw = to_nb.frame_width;
          rr = (tnh/2) * (tnh/2);  // R square
          aa = (dy / dx) * (dy / dx);  // A square
          dd = tnw/2;
          nn = (-dd - Math.sqrt(rr - aa*(dd*dd - rr))) / (1 + aa);
          if(dx > 0) {
            // Link points towards the right.
            arrw.to_x = tnx - nn;
            arrw.to_y = tny - nn * dy / dx;
          } else {
            arrw.to_x = tnx + nn;
            arrw.to_y = tny + nn * dy / dx;
          }
        } else {
          // Rectangular node.
          arrw.to_x = (dx > 0 ? tnx + w/2 : tnx - w/2);
          arrw.to_y = tny + w/2 * dy / Math.abs(dx);
        }
      }
    }

    // Assume default arrow properties.
    sda = 'none';
    stroke_color = (ignored ? this.palette.ignore : this.palette.node_rim);
    stroke_width = 1.5;
    arrow_start = 'none';
    arrow_end = (ignored ? this.ignore_triangle : this.triangle);
    // Default multi-flow values are: NO multiflow, NOT congested or reversed.
    let mf = [0, 0, 0, false, false],
        reversed = false;
    // These may need to be modified due to actual flow, etc.
    if(arrw.links.length === 1) {
      // Display link properties of a specific link if arrow is plain.
      luc = arrw.links[0];
      ignored = ignored || MODEL.ignored_entities[luc.identifier];
      if(MODEL.solved && !ignored) {
        // Draw arrow in dark blue if a flow occurs, or in a lighter gray
        // if NO flow occurs.
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
          stroke_color = 'silver';
          arrow_end = this.inactive_triangle;
        }
      } else if(ignored) {
        af = VM.UNDEFINED;
        stroke_color = this.palette.ignore;
        arrow_end = this.ignore_triangle;
      }
      if(luc.from_node instanceof Process) {
        proc = luc.from_node;
        prod = luc.to_node;
      } else {
        proc = luc.to_node;
        prod = luc.from_node;
      }
      // NOTE: `luc` may also be a constraint!
      if(luc instanceof Link) {
        grid = proc.grid;
        if(luc.is_feedback) {
          sda = UI.sda.long_dash_dot;
          arrow_end = this.feedback_triangle;
        }
      }
      // Data link => dotted line.
      if(luc.dataOnly) {
        sda = UI.sda.dot;
      }
      if(luc.selected) {
        // Draw arrow line thick and in red.
        stroke_color = this.palette.select;
        stroke_width = 2;
        if(arrow_end == this.open_wedge) {
          arrow_end = this.selected_open_wedge;
        } else {
          arrow_end = this.selected_triangle;
        }
      }
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
    // and size and number of the arrow heads.
    // NOTE: Re-use of dx and dy for different purpose!
    dx = arrw.to_x - arrw.from_x;
    dy = arrw.to_y - arrw.from_y;
    l = Math.sqrt(dx * dx + dy * dy);
    let cdx = 0, cdy = 0;
    if(l > 0) {
      // Amount to shorten the line to accommodate arrow head.
      // NOTE: For thicker arrows, subtract a bit more.
      cdx = (4 + 1.7 * (stroke_width - 1.5)) * dx / l;
      cdy = (4 + 1.7 * (stroke_width - 1.5)) * dy / l;
    }
    if(reversed) {
      // Adjust end points by 1/2 px for rounded stroke end.
      bpx = arrw.to_x - 0.5*dx / l;
      bpy = arrw.to_y - 0.5*dy / l;
      // Adjust start points for arrow head(s).
      epx = arrw.from_x + cdx;
      epy = arrw.from_y + cdy;
      if(arrw.bidirectional) {
        bpx -= cdx;
        bpy -= cdy;
      }
    } else {
      // Adjust start points by 1/2 px for rounded stroke end.
      bpx = arrw.from_x + 0.5*dx / l;
      bpy = arrw.from_y + 0.5*dy / l;
      // Adjust end points for arrow head(s).
      epx = arrw.to_x - cdx;
      epy = arrw.to_y - cdy;
      if(arrw.bidirectional) {
        bpx += cdx;
        bpy += cdy;
      }
    }
    // Calculate actual (multi)flow, as this co-determines the color of the arrow.
    if(MODEL.solved && !ignored) {
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
      } else {
        if(stroke_color != this.palette.select) stroke_color = 'silver';
        if(arrow_end === this.double_triangle) {
          arrow_end = this.inactive_double_triangle;
        }
      }
    } else {
      af = VM.UNDEFINED;
      if(ignored && stroke_color != this.palette.select) {
        stroke_color = this.palette.ignore;
        arrow_end = this.ignore_triangle;
      }
    }
    if(arrw.bidirectional) arrow_start = arrow_end;         
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
      if(lfd != 0) {
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
        // Some symbols do not center prettily => raise by 1 or 1.5 px
        const
            raise_1px = ([VM.LM_INCREASE, VM.LM_MEAN, VM.LM_STARTUP,
                VM.LM_THROUGHPUT].indexOf(luc.multiplier) >= 0),
            raise = (raise_1px ? 1 :
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
      let with_rate = true;
      if(grid) {
        // For power links, only draw the rate when the model has been run
        // and the actual flow is less than the process level (so the rate
        // then reflects the loss).
        if(luc.to_node.is_data) {
          // No loss rates on data links from grod processes. 
          with_rate = false;
        } else {
          const
              absf = Math.abs(af),
              apl = Math.abs(proc.actualLevel(MODEL.t));
          with_rate = MODEL.solved && apl - absf > VM.SIG_DIF_FROM_ZERO;
          font_color = 'gray';
          s = VM.sig4Dig(absf / apl);
          bb = this.numberSize(s);
          th = bb.height;
          tw = Math.max(th, bb.width);
        }
      }
      if(with_rate) {
        // Draw the rate in a semi-transparent white roundbox.
        arrw.shape.addRect(epx, epy, tw, th,
            {fill: 'white', opacity: 0.8, rx: 2, ry: 2});
        arrw.shape.addNumber(epx, epy, s, {fill: font_color, 'font-style': rrfs});
      }
      // Draw the share of cost (only if relevant and > 0) behind the rate
      // in a pale yellow filled box.
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
    const absf = Math.abs(af);
    if(!ignored && l > 0 && af < VM.UNDEFINED && absf > VM.SIG_DIF_FROM_ZERO) {
      const ffill = {fill:'white', opacity:0.8};
      if(luc || mf[0] == 1) {
        // Draw flow data halfway the arrow only if calculated and non-zero.
        // NOTE: Power flows are always absolute flows.
        s = VM.sig4Dig(grid ? absf : af); 
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
        // Highlight if related process(es) are at upper bound
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
        // Assume no cost price to be displayed.
        s = '';
        let soc = 0;
        // NOTE: Flows INTO processes always carry cost.
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
              // Just in case, check for error codes (if so, display them).
              if(cp < VM.MINUS_INFINITY) {
                s = VM.sig4Dig(cp);
              } else if(cp < 0) {
                s = `(${VM.sig4Dig(af * cp)})`;
              }
            }
          }
        } else {
          const d = luc.actualDelay(MODEL.t);
          if(af > 0) {
            // Positive flow => use cost price of FROM node.
            if(luc.from_node instanceof Process) {
              // For processes, this is their cost price per level
              // DIVIDED BY the relative rate of the link.
              const rr = luc.relative_rate.result(MODEL.t);
              if(Math.abs(rr) < VM.NEAR_ZERO) {
                cp = (rr < 0 && cp < 0 || rr > 0 && cp > 0 ?
                    VM.PLUS_INFINITY : VM.MINUS_INFINITY);
              } else {
                cp = proc.costPrice(MODEL.t - d) / rr;
              }
            } else if(prod.price.defined) {
              // For products their market price if defined...
              cp = prod.price.result(MODEL.t - d);
            } else {
              // ... otherwise their cost price.
              cp = prod.costPrice(MODEL.t - d);
            }
          } else {
            // Negative flow => use cost price of TO node.
            if(luc.to_node instanceof Process) {
              // NOTE: Input links have no delay.
              cp = proc.costPrice(MODEL.t);
            } else if(prod.price.defined) {
              cp = prod.price.result(MODEL.t - d);
            } else {
              cp = prod.costPrice(MODEL.t - d);
            }
          }
          // NOTE: The first condition ensures that error codes will be
          // displayed.
          if(cp <= VM.MINUS_INFINITY || cp >= VM.PLUS_INFINITY) {
            s = VM.sig4Dig(cp);
          } else if(Math.abs(cp) <= VM.SIG_DIF_FROM_ZERO) {
            // DO not display CP when it is "propagated" NO_COST.
            s = (cp === VM.NO_COST ? '' : '0');
          } else {
            // NOTE: Use the absolute value of the flow, as cost is not
            // affected by direction.
            s = VM.sig4Dig(Math.abs(af) * soc * cp);
          }
        }
        // Only display cost price if it is meaningful.
        if(s) {
          font_color = 'gray';
          bb = this.numberSize(s, 8, font_weight);
          tw = bb.width;
          th = bb.height;
          // NOTE: Offset cost price label relative to actual flow label.
          epy += th + 1;
          arrw.shape.addRect(epx, epy, tw, th, {'fill': this.palette.cost_price});
          arrw.shape.addNumber(epx, epy, s, {'fill': font_color});
        }
      } // end IF luc and cost prices shown and actual flow not infinite
    } // end IF l > 0 and actual flow is defined and non-zero

    if(l > 0) {
      // NOTE: Make the arrow shape nearly transparant when it connects
      // to a product that has the "hide links" option selected.
      if(arrw.from_node.no_links || arrw.to_node.no_links) {
        arrw.shape.element.setAttribute('opacity', 0.08);
      }
      arrw.shape.appendToDOM();
      return true;
    }
    // If nothing is drawn, return FALSE although this does NOT imply an
    // error.
    return false;
  }
  
  drawConstraint(c) {
    // Draws constraint `c` on the paper.
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
      // points for the curved arrow.
      // NOTE: Nodes are assumed to have been positioned, so the X and Y
      // of products have been updated to correspond with those of their
      // placeholders in the focal cluster.
      const
          p = c.from_node,
          q = c.to_node;
      // First calculate the constraint offsets 
      p.setConstraintOffsets();
      q.setConstraintOffsets();
      const    
          from = [p.x + c.from_offset, p.y],
          to = [q.x + c.to_offset, q.y],
          hph = (p.collapsed ? 6: p.height/2) + ady,
          hqh = (q.collapsed ? 6: q.height/2) + ady,
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
    for(const bl of c.bound_lines) {
      // Draw thumbnail in shades of the arrow color, but use black
      // for regular color or the filled areas turn out too light.
      const clr = (stroke_color === this.palette.node_rim ? 'black' : stroke_color);
      // Set the boundline point coordinates (TRUE indicates: also compute
      // the thumbnail SVG).
      bl.setDynamicPoints(MODEL.t, true);
      el = this.newSVGElement('path');
      if(bl.type === VM.EQ) {
        // For EQ bound lines, draw crisp line on silver background.
        this.addSVGAttributes(el,
            {d: bl.contour_path, fill: 'none', stroke: clr, 'stroke-width': 30});
      } else {
        // Draw infeasible area in gray
        this.addSVGAttributes(el, {d: bl.contour_path, fill: clr, opacity: 0.3});
      }
      svg.appendChild(el);
    }
    // Draw the share of cost (only if relevant and non-zero) near tail
    // (or head if Y->X) of arrow in a pale yellow filled box.
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
    if(proc.grid && MODEL.ignore_grid_capacity) {
      lb = VM.MINUS_INFINITY;
      ub = VM.PLUS_INFINITY;
    }
    // NOTE: By default, lower bound = 0 (but do show exceptional values).
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
        stroke_color = this.palette.plus_infinite_level;
        fill_color = this.palette.above_upper_bound;
        lrect_color = this.palette.plus_infinite_level;
        font_color = 'white';
        stroke_width = 2;
      } else if(l === VM.MINUS_INFINITY) {
        // Infinite level => unbounded solution
        stroke_color = this.palette.minus_infinite_level;
        fill_color = this.palette.below_lower_bound;
        lrect_color = this.palette.minus_infinite_level;
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
      } else if(Math.abs(l) < VM.ON_OFF_THRESHOLD) {
        font_color = this.palette.node_rim;
      } else if(l < 0) {
        // Negative level => more reddish stroke and font.
        font_color = this.palette.compound_flow;
        stroke_color = font_color;
        if(proc.grid) {
          bar_ratio = l / -ub;
        } else if(lb < -VM.NEAR_ZERO) {
          bar_ratio = l / lb;
        }
        stroke_width = 1.25;
      } else {
        font_color = this.palette.active_process;
        stroke_color = font_color;
        if(ub > VM.NEAR_ZERO) bar_ratio = l / ub;
        stroke_width = 1.25;
      }
      // For options, set longer-dashed rim if committed at time <= t.
      const fcn = (is_fc_option ? proc : fc_option_node);
      // NOTE: When initial level =/= 0, option is already committed at t=0.
      if(fcn && (!fcn.actualLevel(0) ||
         (fcn.start_ups.length > 0 && MODEL.t >= fcn.start_ups[0]))) {
        sda = UI.sda.longer_dash;
      }
    } else if(il) {
      // Display non-zero initial level black-on-white, and then also
      // display the level bar.
      if(il < 0 && lb < -VM.NEAR_ZERO) {
        bar_ratio = il / lb;
      } else if(il > 0 && ub > VM.NEAR_ZERO) {
        bar_ratio = il / ub;
      }
      bar_color = this.palette.src_snk;
      l = il;
    }
    // Being selected overrules special border properties except SDA.
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
    // Draw frame using colors as defined above.
    proc.shape.addRect(x, y, 2 * hw, 2 * hh,
        {fill: fill_color, stroke: stroke_color, 'stroke-width': stroke_width,
            'stroke-dasharray': sda, 'stroke-linecap': 'round'});
    // Draw level indicator: 8-pixel wide vertical bar on the right.
    if(bar_ratio > VM.NEAR_ZERO) {
      // Calculate half the bar's height (bar rectangle is centered).
      const
          hsw = stroke_width / 2,
          hbl = hh * bar_ratio - hsw;
      // Collapesed grid processes display a "wire" instead of a bar.
      if(proc.grid && proc.collapsed) {
        proc.shape.addPath(
            ['M', x - hw + 0.5, ',', y - hh/2, 'L', x + hw - 0.5, ',', y - hh/2],
            // NOTE: Use *squared* bar ratio to reflect quadratic losses.
            {fill: 'none', stroke: proc.grid.color,
                'stroke-width': hh * bar_ratio * bar_ratio});
      } else {
        // NOTE: When level < 0, bar drops down from top.
        proc.shape.addRect(x + hw - 4 - hsw,
            (l < 0 ? y - hh + hbl + hsw : y + hh - hbl - hsw),
            8, 2 * hbl, {fill: bar_color, stroke: 'none'});
      }
    }
    // If semi-continuous, add a double rim 2px above the bottom line.
    if(proc.level_to_zero) {
      const bly = y + hh - 2;
      proc.shape.addPath(['M', x - hw, ',', bly, 'L', x + hw, ',', bly],
          {'fill': 'none', stroke: stroke_color, 'stroke-width': 0.6});
    }
    // If grid element, add colored strip at bottom.
    if(proc.grid) {
      proc.shape.addRect(x, y + hh - 3.3, 2*hw - 1.5, 6,
          {'fill': proc.grid.color, stroke: 'none'});
      // If grid enforces Kirchhoff's voltage law and/or losses, length
      // matters, so draw a white horizontal line through the strip that
      // is proportional to the length property of the process.
      if(MODEL.solved &&
          (proc.grid.kirchhoff || proc.grid.loss_approximation)) {
        const
            maxl = Math.max(1, POWER_GRID_MANAGER.max_length),
            w = (2 * hw - 8) * proc.length_in_km / maxl,
            bly = y + hh - 3.3;
        proc.shape.addPath(
            ['M', x - w/2, ',', bly, 'L', x + w/2, ',', bly],
            {'fill': 'none', stroke: 'white', 'stroke-width': 1.5,
                'stroke-linecap': 'round'});        
      }
      // If process has no capacity, cross it out.
      if(ub <= VM.NEAR_ZERO) {
        proc.shape.addPath(
            ['M', x - hw + 0.8, ',', y - hh + 0.5,
             'L', x + hw - 0.5, ',', y + hh - 0.5,
             'M', x - hw + 0.8, ',', y + hh - 0.5,
             'L', x + hw - 0.5, ',', y - hh + 0.5],
            {fill: 'none', stroke: 'white', 'stroke-width': 2,
                'stroke-linecap': 'round'});
        proc.shape.addPath(
            ['M', x - hw + 0.8, ',', y - hh + 0.5,
             'L', x + hw - 0.5, ',', y + hh - 0.5,
             'M', x - hw + 0.8, ',', y + hh - 0.5,
             'L', x + hw - 0.5, ',', y - hh + 0.5],
            {fill: 'none', stroke: proc.grid.color, 'stroke-width': 1,
                'stroke-linecap': 'round'});
      }
    }
    if(!proc.collapsed) {
      // If model has been computed or initial level is non-zero, draw
      // production level in upper right corner.
      const il = proc.initial_level.result(1);
      if(MODEL.solved || il) {
        if(!MODEL.solved) {
          l = il;
          font_color = 'black';
        } else if(bar_ratio !== 1) {
          if(l > 0) {
            font_color = this.palette.active_process;          
          } else if(l < 0) {
            font_color = this.palette.compound_flow;   
          }
        }
        s = VM.sig4Dig(Math.abs(l));
        // Oversize level box width by 4px and height by 1px.
        const
            bb = this.numberSize(s, 9),
            bw = bb.width + 2,
            bh = bb.height;
        // Upper right corner =>
        //   (x + width/2 - number width/2, y - height/2 + number height/2)
        // NOTE: Add 0.5 margin to stay clear from the edges.
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
        if(proc.grid) {
          const sign = POWER_GRID_MANAGER.inCycle(proc);
          if(sign) {
            const
                sym = (sign === '+' ? '\u2941' : '\u2940'),
                oc = (sign === '+' ? '#0000E0' : '#E00000');
            proc.shape.addText(x + hw - 2, y - hh + bh + 3, sym,
              {'font-size': 9, fill: oc, 'text-anchor':'end'});
          }
        }
      }
      // Draw boundaries in upper left corner.
      // NOTE: Their expressions should have been computed.
      s = VM.sig4Dig(lb);
      // Calculate width of lower bound because it may have to be underlined.
      let lbw = this.numberSize(s).width;
      // Default offset for lower bound undercore (if drawn).
      let lbo = 1.5;
      if(ub === lb) {
        // If bounds are equal, show bound preceded by equal sign.
        s = '=' + s;
        // Add text width of equal sign to offset.
        lbo += 5;
      } else {
        const ubs = (ub >= VM.PLUS_INFINITY && !proc.upper_bound.defined ?
            '\u221E' : VM.sig4Dig(ub));
        if(lb && !proc.grid) {
          // If lb <> 0 then lb...ub (with ellipsis).
          s += '\u2026' + ubs;
        } else {
          // If grid process or lb = 0, show only the upper bound.
          s = ubs;
          lbw = 0;
        }
      }
      // Keep track of the width of the boundary text, as later it may be
      // followed by more text.
      const
          bb = this.numberSize(s),
          btw = bb.width + 2,
          sh = bb.height,
          tx = x - hw + 1,
          ty = y - hh + sh/2 + 1,
          bc = (proc.grid && MODEL.ignore_grid_capacity ? '#A00080' : 'black');
      proc.shape.addNumber(tx + btw/2, ty, s,
          {fill: bc, 'font-style': bfs});
      if(proc.grid) {
        proc.shape.addText(tx + 1, ty + 8, proc.grid.power_unit,
          {'font-size': 6, fill: bc, 'text-anchor':'start'});
      }
      // Show start/stop-related status right of the process boundaries.
      if(proc.is_zero_var_index >= 0) {
        font_color = 'black';
        if(proc.level_to_zero) {
          // Underline the lower bound to indicate semi-continuity.
          proc.shape.addPath(
              ['M', tx + lbo, ',', ty + sh/2, 'L', tx + lbo + lbw, ',', ty + sh/2],
              {'fill': 'none', stroke: font_color, 'stroke-width': 0.5});
        }
        // By default, no ON/OFF indicator.
        s = '';
        if(MODEL.solved && l !== VM.UNDEFINED) {
          // Solver has been active.
          const
              pl = proc.actualLevel(MODEL.t - 1),
              su = proc.start_ups.indexOf(MODEL.t),
              sd = proc.shut_downs.indexOf(MODEL.t);
          if(Math.abs(l) > VM.ON_OFF_THRESHOLD) {
            // Process is ON.
            if(Math.abs(pl) < VM.ON_OFF_THRESHOLD && su >= 0) {
              font_color = this.palette.switch_on_off;
              // Start-up arrow or first-commit asterisk.
              // NOTE: No asterisk when FC is ignored because initial level
              // is non-zero.
              s = VM.LM_SYMBOLS[su || proc.first_commit_var_index < 0 ?
                  VM.LM_STARTUP : VM.LM_FIRST_COMMIT];
            } else if(su >= 0) {
              font_color = 'black';
              s = '\u25B3'; // Outline triangle up to indicate anomaly.
            }
            if(sd >= 0) {
              // Should not occur, as for shut-down, level should be 0.
              font_color = 'black';
              s += '\u25BD'; // Add outline triangle down to indicate anomaly.
            }
          } else {
            // Process is OFF => check previous level.
           if(pl && sd >= 0) {
              // Process was on, and is now switched OFF.
              font_color = this.palette.switch_on_off;
              s = VM.LM_SYMBOLS[VM.LM_SHUTDOWN];
            } else if(sd >= 0) {
              font_color = 'black';
              s = '\u25BD'; // Outline triangle down to indicate anomaly.
            }
            if(su >= 0) {
              // Should not occur, as for start-up, level should be > 0.
              font_color = 'black';
              s += '\u25B3'; // Add outline triangle up to indicate anomaly.
            }
          }
        }
        if(s) {
          // Special symbols are 5 pixels wide and 9 high.
          proc.shape.addText(x - hw + btw + 5, y - hh + 4.5, s,
              {fill: font_color});
        }
      }
      if(MODEL.infer_cost_prices && MODEL.solved) {
        // Draw costprice data in lower left corner.
        const cp = proc.costPrice(MODEL.t);
        s = VM.sig4Dig(cp);
        if(l === 0) {
          // No "real" cost price when process level = 0.
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
      // Draw pace in lower right corner if it is not equal to 1.
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
      // Always draw process name plus actor name (if any).
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
      // to denote "floor" as well as "ceiling".
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
      // Add block arrows for hidden input and output links (no IO for processes).
      proc.shape.addBlockArrow(x - hw + 3, y - hh + 17, UI.BLOCK_IN,
          proc.hidden_inputs.length);
      proc.shape.addBlockArrow(x + hw - 4, y - hh + 17, UI.BLOCK_OUT,
          proc.hidden_outputs.length);
    }
    // Highlight shape if it has comments.
    proc.shape.element.firstChild.setAttribute('style',
        (DOCUMENTATION_MANAGER.visible && proc.comments.length > 0 ?
            this.documented_filter : ''));
    proc.shape.element.setAttribute('opacity', 0.9);
    proc.shape.appendToDOM();    
  }
  
  drawProduct(prod, dx=0, dy=0) {
    // Clear previous drawing.
    prod.shape.clear();
    // Do not draw product unless it has a position in the focal cluster.
    let pp = prod.positionInFocalCluster;

    if(!pp) return;
    // Set X and Y to correct value for this diagram.
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
        // Draw border as dashed line if product is data product, and
        // for actor cash flow data as dotted line.
        sda = (prod.is_data ?
            (prod.name.startsWith('$') ? UI.sda.dot : UI.sda.dash) :
            'none'),
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
    // When model not solved, use initial level.
    let l = prod.actualLevel(MODEL.t);
    if(!MODEL.solved  && prod.initial_level.defined) {
      l = prod.initial_level.result(1);
    }
    if(first_commit_option) {
      // Set short-dashed rim if not committed yet at time t.
      if(!MODEL.solved || prod.start_ups.length === 0 ||
          MODEL.t < prod.start_ups[0]) {
        sda = UI.sda.shorter_dash;
      } else {
        // Otherwise, set longer-dashed rim to denote "has been committed".
        sda = UI.sda.longer_dash;
      }
    }
    if(prod.selected) {
      stroke_color = this.palette.select;
      stroke_width = 2;
    } else  {
      stroke_color = ignored ? this.palette.ignore :
          (prod.no_slack ? 'black' : this.palette.node_rim);
      // Thick rim if deleting this product only occurs in the focal cluster.
      stroke_width = (prod.allLinksInCluster(MODEL.focal_cluster) ? 1.5 : 0.6);
    }
    if(prod.hasBounds) {
      font_color = 'black';
      // By default, "plain" factors having bounds are filled in silver.
      fill_color = this.palette.has_bounds;
      // Use relative distance to bounds so that 100000.1 is not shown
      // as overflow, but 100.1 is.
      let udif = this.relDif(l, ub),
          ldif = this.relDif(lb, l);
      // Special case: for LB = 0, use the ON/OFF threshold.
      if(Math.abs(lb) <= VM.SIG_DIF_LIMIT &&
          Math.abs(l) <= VM.ON_OFF_THRESHOLD) ldif = 0;
      if(MODEL.solved) {
        // NOTE: Use bright red and blue colors in case of "stock level
        // out of bounds".
        if(ub < VM.PLUS_INFINITY && l < VM.UNDEFINED && udif > VM.SIG_DIF_LIMIT) {
          fill_color = this.palette.above_upper_bound;
          font_color = 'blue';
        } else if(lb > VM.MINUS_INFINITY && ldif > VM.SIG_DIF_LIMIT) {
          fill_color = this.palette.below_lower_bound;
          font_color = 'red';
        } else if(l < VM.ERROR || l > VM.EXCEPTION) {
          font_color = this.palette.VM_error;
        } else if(l < VM.UNDEFINED) {
          // Shades of green reflect whether level is within bounds, where
          // "sources" (negative level) and "sinks" (positive level) are
          // shown as more reddish / bluish shades of green.
          if(l < -VM.ON_OFF_THRESHOLD) {
            fill_color = this.palette.neg_within_bounds;
            font_color = this.palette.neg_within_bounds_font;
          } else if(l > VM.ON_OFF_THRESHOLD) {
            fill_color = this.palette.pos_within_bounds;
            font_color = this.palette.pos_within_bounds_font;
          } else {
            fill_color = this.palette.zero_within_bounds;
            font_color = this.palette.within_bounds_font;
          }
          if(ub - lb < VM.NEAR_ZERO) {
            // When LB = UB, fill completely in the color, but ...
            if(l && prod.isConstant) {
              // ... non-zero constants have less saturated shades.
              fill_color = (l < 0 ? this.palette.neg_constant :
                  this.palette.pos_constant);  
            }
          } else if(ub - l < VM.SIG_DIF_LIMIT) {
            // Deeper fill shade indicate "at upper bound".
            fill_color = (ub > 0 ? this.palette.at_pos_ub_fill :
                (ub < 0 ? this.palette.at_neg_ub_fill :
                    this.palette.at_zero_ub_fill));
            at_bound = true;
          } else if (l - lb < VM.SIG_DIF_LIMIT) {
            // Deeper fill shade indicates "at lower bound".
            fill_color = (lb > 0 ? this.palette.at_pos_lb_fill :
                (lb < 0 ? this.palette.at_neg_lb_fill :
                    this.palette.at_zero_lb_fill));
            at_bound = true;
          } else {
            // Set "partial fill" flag if not at lower bound and UB < INF.
            pf = ub < VM.PLUS_INFINITY;
          }
        }
      } else if(ub - lb < VM.NEAR_ZERO) {
        // Not solved but equal bounds => probably constants.
        if(ub && prod.isConstant) {
          // Non-zero constants have less saturated shades.
          fill_color = (ub < 0 ? this.palette.neg_constant :
              this.palette.pos_constant);  
        }
      } else if(l < VM.UNDEFINED) {
        // Different bounds and initial level set => partial fill.
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
      // Products with storage capacity show their partial fill.
      pf = true;
      // Background fill color of buffers is white unless exceptional.
      let npfbg = 'white';
      if(fill_color === this.palette.above_upper_bound ||
          fill_color === this.palette.below_lower_bound ||
          // NOTE: Empty buffers should be entirely white.
          (at_bound && l > lb + VM.ON_OFF_THRESHOLD)) {
        npfbg = fill_color;
        pf = false;
      }
      // Products are displayed as "roundboxes" with sides that are full hemicircles.
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
      // NOTE: Set fill color to darker shade for partial fill.
      fill_color = (!MODEL.solved ? this.palette.src_snk :
          (l > VM.NEAR_ZERO ? this.palette.above_zero_fill :
              (l < -VM.NEAR_ZERO ? this.palette.below_zero_fill :
                  this.palette.at_zero_fill)));
    }
    // Add partial fill if appropriate.
    if(pf && l > lb && l < VM.UNDEFINED) {
      // Calculate used part of range (1 = 100%)
      let part,
          range = ub - lb;
      if(l >= VM.PLUS_INFINITY) {
        // Show exceptions and +INF as "overflow".
        part = 1;
        fill_color = this.palette.above_upper_bound;
      } else {
        part = (range > 0 ? (l - lb) / range : 1);
      }
      if(part > 0 && l >= lb) {
        // Only fill the portion of used range with the fill color.
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
    // (in outline if *implicit* source).
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
    // (in outline if implicit sink).
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
    // to denote "floor" as well as "ceiling".
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
      // Write the stock level in the right semicircle.
      s = VM.sig4Dig(l);
      bb = this.numberSize(s, 9, 700);
      lw = bb.width;
      hlh = bb.height/2 + 1;
      const attr = {'font-size': 9, 'text-anchor': 'end'};
      // NOTE: Use anchor to align the stock level text to the right side.
      if(l <= VM.ERROR) {
        attr.fill = this.palette.VM_error;
      } else {
        attr.fill = font_color;
        attr['font-weight'] = 700;
        if(at_bound) {
          // Underline level to indicate "at bound".
          // NOTE: Draw underline as path because text decoration is not
          // always rendered, e.g. not by LaTeX/Overleaf.
          prod.shape.addPath(
              ['M', lx - lw, ',', y - 1, 'L', lx, ',', y - 1],
              {'fill': 'none', stroke: 'black', 'stroke-width': 0.55});
          // Original code used text decoration attribute.
          // attr['text-decoration'] = 'solid black underline';
        }
      }
      prod.shape.addNumber(lx, y - hlh, s, attr);
    }
    if(MODEL.solved && !ignored) {
      if(MODEL.infer_cost_prices) {
        // Write the cost price at bottom-right in a light-yellow, slightly
        // rounded box. NOTE: for products with storage, display the STOCK price
        // rather than the cost price
        const cp = prod.costPrice(MODEL.t);
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
    if(mp && mp < VM.UNDEFINED) {
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
    if(clstr.module) {
      // Add three white dots at middle of bottom shade.
      const
          ely = y + hh - shadow_width / 2,
          elfill = {fill: 'white'};
      clstr.shape.addEllipse(x - 4, ely, 1, 1, elfill);
      clstr.shape.addEllipse(x, ely, 1, 1, elfill);
      clstr.shape.addEllipse(x + 4, ely, 1, 1, elfill);
    }
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
      // Draw diagonal cross.
      clstr.shape.addPath(['m', x - hw + 6, ',', y - hh + 6,
          'l', w - 12 - shadow_width, ',', h - 12 - shadow_width,
          'm', 12 - w + shadow_width, ',0',
          'l', w - 12 - shadow_width, ',', 12 - h + shadow_width],
          {stroke: this.palette.ignore, 'stroke-width': 6,
              'stroke-linecap': 'round'});
    }
    if(!clstr.collapsed) {
      // Draw text.
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
        for(const an of anl) {
          clstr.shape.addText(x, any, an, format);
          any += 12;
        }
      }
    }
    if(MODEL.show_block_arrows && !ignored) {
      // Add block arrows for hidden IO links.
      clstr.shape.addBlockArrow(x - hw + 3, y - hh + 15, UI.BLOCK_IN,
          clstr.hidden_inputs.length);
      clstr.shape.addBlockArrow(x + hw - 4, y - hh + 15, UI.BLOCK_OUT,
          clstr.hidden_outputs.length);
      clstr.shape.addBlockArrow(x, y - hh, UI.BLOCK_IO,
          clstr.hidden_io.length);
    }
    if(clstr === UI.target_cluster) {
      // Highlight cluster if it is the drop target for the selection.
      clstr.shape.element.childNodes[0].setAttribute('style',
          this.target_filter);
      clstr.shape.element.childNodes[1].setAttribute('style',
          this.target_filter);
    } else if(DOCUMENTATION_MANAGER.visible && clstr.comments) {
      // Highlight shape if it has comments.
      clstr.shape.element.childNodes[0].setAttribute('style',
          this.documented_filter);
      clstr.shape.element.childNodes[1].setAttribute('style',
          this.documented_filter);
    } else {
      // No highlighting.
      clstr.shape.element.childNodes[0].setAttribute('style', '');
      clstr.shape.element.childNodes[1].setAttribute('style', '');
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

