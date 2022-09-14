/*
Linny-R is an executable graphical specification language for (mixed integer)
linear programming (MILP) problems, especially unit commitment problems (UCP).
The Linny-R language and tool have been developed by Pieter Bots at Delft
University of Technology, starting in 2009. The project to develop a browser-
based version started in 2017. See https://linny-r.org for more information.

This JavaScript file (linny-r-config.js) defines global constants that specify
the URLs for the solver, and for the sound files that are played when error,
warning or information messages are displayed.
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

// The configuration properties may be altered according to user preferences
const CONFIGURATION = {
    // When decimal comma = TRUE, data copied to clipboard from the chart manager
    // will be written with decimal comma instead of decimal point
    // NOTE: May be overruled by model settings
    decimal_comma: false,
    // To keep model files compact, floating point values in datasets and run
    // results are stored with a limited number of significant digits
    dataset_precision: 8,
    results_precision: 6,
    // Default properties for new models
    default_currency_unit: 'EUR',
    default_time_unit: 'hour',
    default_scale_unit: '1',  // 1 denotes "no unit" (abstract scale)
    // Font properties for SVG diagram
    // NOTE: When a font name comprises multiple words, it must be enclosed
    // like so: &quot;Times New Roman&quot;
    default_font_name: 'Arial',
    // Undo stack size limits the number of user actions that can be undone 
    undo_stack_size: 20,
    // The progress needle interval affects the update frequency of the progress
    // needle during tableau construction and while writing the model file that
    // is passed to the solver. On faster machines, the value of this constant
    // can be increased
    progress_needle_interval: 100,
    // By default, the monitor will notify where and when small amounts of slack
    // (< 1e-6) are used (set to FALSE to suppress such notices)
    slight_slack_notices: true,  
    // Allow some control over the size of cluster nodes
    min_cluster_size: 80,
    // To enhance security, a minimum password length is enforced
    // NOTE: changing this value will not affect the encryption key
    min_password_length: 6
  };

// Parameters used for encryption
// NOTE: changing these default values will make that encrypted files cannot
// be decrypted by other Linny-R configurations
const ENCRYPTION = {
    salt: 'YzU0N2Z@MjYy(mV[OGRk=jNlY2#kYj+mMzFk%WV}Yj',
    iterations: 96847
  };
  
// Solver properties should be configured only for a remote server
const SOLVER = {
    // User identifier will typically be an e-mail address
    user_id: '',
    // For solver restrictions, zero indicates "unlimited"
    max_tableau_size: 0,
    max_nr_of_blocks: 0,
    max_solver_time: 0
  };

// NOTE: Debugging is defined as a global *variable* to permit setting it
// locally to TRUE to trace only in selected parts of the code. When debugging,
// the VM will log a trace of its execution on the browser's console.
// NOTE: for longer runs and larger models, this will slow down the browser,
// the text and objects shown in the browser's console will use large amounts
// of computer memory!
let DEBUGGING = false;

    
/////////////////////////////////////////////////////////////////////////////
// Define exports so this file can also be included as a module in Node.js //
/////////////////////////////////////////////////////////////////////////////
if(NODE) module.exports = {
  DEBUGGING: DEBUGGING,
  ENCRYPTION: ENCRYPTION,
  SOLVER: SOLVER,
  CONFIGURATION: CONFIGURATION
}
