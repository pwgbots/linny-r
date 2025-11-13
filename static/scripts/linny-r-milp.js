/*
Linny-R is an executable graphical specification language for (mixed integer)
linear programming (MILP) problems, especially unit commitment problems (UCP).
The Linny-R language and tool have been developed by Pieter Bots at Delft
University of Technology, starting in 2009. The project to develop a browser-
based version started in 2017. See https://linny-r.org for more information.

This JavaScript file (linny-r-milp.js) implements the Node.js interface between
Linny-R and a MILP solver that has been installed on the computer where this
software is running.

NOTE: For browser-based Linny-R, this file should NOT be loaded, as it is
      already included in the server.
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

const
    child_process = require('child_process'),
    fs = require('fs'),
    os = require('os'),
    path = require('path');

// Class MILPSolver implements the connection with the solver.
module.exports = class MILPSolver {
  constructor(name, workspace) {
    if(name) console.log(`Preferred solver: "${name}"`);
    this.solver_path = '';
    this.best_solver = '';
    this.default_solver = '';
    this.locateInstalledSolvers(workspace);
    if(!this.best_solver) {
      console.log('WARNING: No compatible solver found on this machine');
      return;      
    }
    this.id = name.toLowerCase();
    if(!(this.id in this.solver_list)) {
      if(this.id) {
        console.log('WARNING: Preferred solver was not found on this machine');
      }
      this.id = this.best_solver;
    }
    this.default_solver = this.id;
    console.log('Default solver:', this.name);
  }
  
  get name() {
    // Return the name of the current solver.
    const s = this.solver_list[this.id];
    if(s) return s.name;
    return '(no solver)';
  }
  
  changeDefault(id) {
    // Change default solver.
    if(this.solver_list.hasOwnProperty(id)) {
      this.id = id;
      this.default_solver = this.id;
      console.log('Default solver now is', this.name);
      return true;
    }
    console.log(`WARNING: Unknown solver ID "${id}"`);
    return false;
  }
 
  locateInstalledSolvers(workspace) {
    // Create a catalogue of solvers detected on this machine, and warn
    // if the preferred solver `name` is not found.
    this.solver_list = {};
    let sp,
        match,
        // Gurobi may have multiple versions installed. Therefore look
        // for the highest version number.
        max_vn = -1;
    const
        windows = os.platform().startsWith('win'),
        path_list = process.env.PATH.split(path.delimiter);
    // Iterate over all seprate paths in environment variable PATH. 
    for(const p of path_list) {
      // Assume that path is not a solver path.
      sp = '';
      // Check whether it is a Gurobi path.
      match = p.match(/gurobi(\d+)/i);
      if(match) sp = p;
      // If so, ensure that it has a higher version number.
      if(sp && parseInt(match[1]) > max_vn) {
        // Check whether command line version is executable.
        sp = path.join(sp, 'gurobi_cl' + (windows ? '.exe' : ''));
        try {
          fs.accessSync(sp, fs.constants.X_OK);
          console.log('Path to Gurobi:', sp);
          this.solver_list.gurobi = {name: 'Gurobi', path: sp};
          max_vn = parseInt(match[1]);
        } catch(err) {
          console.log(err.message);
          console.log(
              'WARNING: Failed to access the Gurobi command line application');
        }
      }
      if(sp) continue;
      // If no Gurobi path, check whether it is a MOSEK path.
      match = p.match(/[\/\\]mosek.*[\/\\]bin/i);
      if(match) {
        // Check whether mosek(.exe) exists in its directory
        sp = path.join(p, 'mosek' + (windows ? '.exe' : ''));
        try {
          fs.accessSync(sp, fs.constants.X_OK);
          console.log('Path to MOSEK:', sp);
          this.solver_list.mosek = {name: 'MOSEK', path: sp};
        } catch(err) {
          console.log(err.message);
          console.log('WARNING: MOSEK application not found in', sp);
        }
      }
      if(sp) continue;
      // If no MOSEK path, check whether it is a CPLEX path.
      match = p.match(/[\/\\]cplex[\/\\]bin/i);
      if(match) {
        sp = p;
      } else {
        // CPLEX may create its own environment variable for its paths.
        match = p.match(/%(.*cplex.*)%/i);
        if(match) {
          for(const cp of process.env[match[1]].split(path.delimiter)) {
            if(cp.match(/[\/\\]cplex[\/\\]bin/i)) {
              sp = cp;
              break;
            }
          }
        }
      }
      if(sp) {
        // Check whether cplex(.exe) exists in its directory.
        sp = path.join(sp, 'cplex' + (windows ? '.exe' : ''));
        try {
          fs.accessSync(sp, fs.constants.X_OK);
          console.log('Path to CPLEX:', sp);
          this.solver_list.cplex = {name: 'CPLEX', path: sp};
        } catch(err) {
          console.log(err.message);
          console.log('WARNING: CPLEX application not found in', sp);
        }
        continue;
      }
      // If no CPLEX path, check whether it is a SCIP path.
      match = p.match(/[\/\\]scip[^\/\\]+[\/\\]bin/i);
      if(match) {
        // Check whether scip(.exe) exists in its directory
        sp = path.join(p, 'scip' + (windows ? '.exe' : ''));
        try {
          fs.accessSync(sp, fs.constants.X_OK);
          console.log('Path to SCIP:', sp);
          this.solver_list.scip = {name: 'SCIP', path: sp};
        } catch(err) {
          console.log(err.message);
          console.log('WARNING: SCIP application not found in', sp);
        }
      }
      // NOTE: Order of paths is unknown, so keep iterating.
    }
    // For macOS, look in applications directory if not found in PATH.
    if(!this.solver_list.gurobi && !windows) {
      console.log('Looking for Gurobi in /usr/local/bin');
      try {
        // On macOS and Unix, Gurobi is in the user's local binaries.
        sp = '/usr/local/bin/gurobi_cl';
        fs.accessSync(sp);
        this.solver_list.gurobi = {name: 'Gurobi', path: sp};
      } catch(err) {
        // No detection is not an error, so no action needed.
      }
    }
    // Check if lp_solve(.exe) exists in working directory.
    sp = path.join(workspace.working_directory,
        'lp_solve' + (windows ? '.exe' : '')); 
    try {
      fs.accessSync(sp, fs.constants.X_OK);
      console.log('Path to LP_solve:', sp);
      this.solver_list.lp_solve = {name: 'LP_solve', path: sp};
    } catch(err) {
      // No error because LP_solve may not be needed.
    }
    this.best_solver = '';
    let s = this.solver_list.gurobi;
    if(s) {
      s.ext = '.lp';
      s.user_model = path.join(workspace.solver_output, 'user_model.lp');
      s.solver_model = path.join(workspace.solver_output, 'solver_model.lp');
      s.solution = path.join(workspace.solver_output, 'gurobi.json');
      s.log = path.join(workspace.solver_output, 'gurobi.log');
      // NOTE: Arguments 0, 1, 2 and 3 will be updated for each solver run.
      s.args = [
          'timeLimit=30',
          'intFeasTol=5e-7',
          'MIPGap=1e-4',
          'NumericFocus=0',
          'JSONSolDetail=1',
          `LogFile=${s.log}`,
          `ResultFile=${s.solution}`,
          `ResultFile=${s.solver_model}`,
          `${s.user_model}`
        ];
      // Function to provide legend to status codes.
      s.statusMessage = (s) => {
        if(s >= 1 && s <= 15) return [
            'Model loaded -- no further information',
            'Optimal solution found',
            'The model is infeasible',
            'The model is either unbounded or infeasible',
            'The model is unbounded',
            'Aborted -- Optimal objective is worse than specified cut-off',
            'Halted -- Iteration limit exceeded',
            'Halted -- Node limit exceeded',
            'Halted -- Solver time limit exceeded',
            'Halted -- Solution count limit exceeded',
            'Halted -- Optimization terminated by user',
            'Halted -- Unrecoverable numerical difficulties',
            'The model is sub-obtimal',
            'Optimization still in progress',
            'User-specified objective limit has been reached'
          ][s - 1];
        // No message otherwise; if `s` is non-zero, exception is reported.
        return '';
      };
      // For some status codes, solution may be sub-optimal, but useful.
      s.usableSolution = (s) => {
        return [2, 5, 7, 8, 9, 10, 13, 15].indexOf(s) >= 0;
      };
      this.best_solver = 'gurobi';   
    }
    s = this.solver_list.mosek;
    if(s) {
      s.ext = '.lp';
      s.user_model = path.join(workspace.solver_output, 'user_model.lp');
      s.solver_model = path.join(workspace.solver_output, 'solver_model.lp');
      s.solution = path.join(workspace.solver_output, 'user_model.int');
      s.log = path.join(workspace.solver_output, 'mosek.log');
      // NOTE: MOSEK command line accepts space separated commands, but paths
      // should be enclosed in quotes.
      s.args = [
          `-out "${s.solver_model}"`,
          `-d MSK_DPAR_MIO_MAX_TIME %T%`,
          `-d MSK_DPAR_MIO_TOL_ABS_RELAX_INT %I%`,
          '-d MSK_DPAR_MIO_REL_GAP_CONST %M%',
          `"${s.user_model}"`
        ];
      s.solve_cmd = `mosek ${s.args.join(' ')} >${s.log}`;
      // Function to provide legend to status codes.
      s.statusMessage = (s) => {
        if(s === 0) return '';
        if(s >= 100000) {
          s -= 100000;
          const m = {
              0: 'Maximum number of iterations exceeded',
              1: 'Time limit exceeded',
              2: 'Objective value outside range',
              6: 'Terminated due to slow progress',
              8: 'Maximum number of integer relaxations exceeded',
              9: 'Maximum number of branches exceeded',
              15: 'Maximum number of feasible solutions exceeded',
              20: 'Maximum number of set-backs exceeded',
              25: 'Terminated due to numerical problems',
              30: 'Terminated due to internal error',
              31: 'Terminated due to internal error'
          };
          return m[s] || '';
        }
        if(s >= 1000 && s <= 1030) {
          return 'Invalid MOSEK license - see message in monitor';
        }
        // All other codes beyond 1000 indicate an error.
        if(s > 1000) {
          return 'Solver encoutered a problem - see messages in monitor';
        }
        return 'Solver warning(s) - see messages in monitor'; 
      };
      // For some status codes, solution may be sub-optimal, but useful.
      s.usableSolution = (s) => {
        return [2, 5, 7, 8, 9, 10, 13, 15].indexOf(s) >= 0;
      };
      this.best_solver = this.best_solver || 'mosek';
    }
    s = this.solver_list.cplex;
    if(s) {
      s.ext = '.lp';
      s.user_model = path.join(workspace.solver_output, 'user_model.lp');
      s.solver_model = path.join(workspace.solver_output, 'solver_model.lp');
      s.solution = path.join(workspace.solver_output, 'cplex.sol');
      // NOTE: CPLEX log file is located in the Linny-R working directory
      s.log = path.join(workspace.solver_output, 'cplex.log');
      // NOTE: CPLEX command line accepts space separated commands ...
      s.args = [
          `read ${s.user_model}`,
          `write ${s.solver_model} lp`,
          'set timelimit %T%',
          'set mip tolerances integrality %I%',
          'set mip tolerances mipgap %M%',
          'optimize',
          `write ${s.solution} 0`,
          'quit'
        ];
      // ... when CPLEX is called with -c option. Each command must then
      // be enclosed in double quotes.
      s.solve_cmd = `cplex -c "${s.args.join('" "')}"`;
      // NOTE: CPLEX error message is inferred from solution file.
      s.statusMessage = () => { return ''; };
      // For some status codes, solution may be sub-optimal, but useful.
      s.usableSolution = (s) => {
        return false; // @@@ STILL TO CHECK!
      };
      this.best_solver = this.best_solver || 'cplex';
    }
    s = this.solver_list.scip;
    if(s) {
      s.ext = '.lp';
      s.user_model = path.join(workspace.solver_output, 'user_model.lp');
      s.solver_model = path.join(workspace.solver_output, 'solver_model.lp');
      s.solution = path.join(workspace.solver_output, 'scip.sol');
      s.log = path.join(workspace.solver_output, 'scip.log');
      // NOTE: SCIP command line accepts space separated commands ...
      s.args = [
          'read', s.user_model,
          'write problem', s.solver_model,
          'set limit time %T%',
          'set numerics feastol %I%',
          'set limit gap %M%',
          'optimize',
          'write solution', s.solution,
          'quit'
        ];
      // ... when SCIP is called with -c option. The command string (not
      // the separate commands) must then be enclosed in double quotes.
      // SCIP outputs its messages to the terminal, so these must be
      // caputured in a log file, hence the output redirection with > to
      // the log file.
      s.solve_cmd = `scip -c "${s.args.join(' ')}" >${s.log}`;
      // Function to provide legend to status codes.
      s.statusMessage = (s) => {
        if(s >= 1 && s <= 15) return [
            'User interrupt',
            'Node limit reached',
            'Total node limit reached',
            'Stalling node limit reached',
            'Time limit reached',
            'Memory limit reached',
            'Gap limit reached',
            'Solution limit reached',
            'Solution improvement limit reached',
            'Restart limit reached',
            'Optimal solution found',
            'Problem is infeasible',
            'Problem is unbounded',
            'Problem is either infeasible or unbounded',
            'Solver terminated by user'
          ][s - 1];
        // No message otherwise; if `s` is non-zero, exception is reported.
        return '';
      };
      // For some status codes, solution may be sub-optimal, but useful.
      s.usableSolution = (s) => {
        return false; // @@@ STILL TO CHECK!
      };
      this.best_solver = this.best_solver || 'scip';
    }
    s = this.solver_list.lp_solve;
    if(s) {
      s.ext = '.lp';
      s.user_model = path.join('user', 'solver', 'user_model.lp');
      s.solver_model = path.join('user', 'solver', 'solver_model.lp');
      // NOTE: LP_solve outputs solver messages AND solution to console,
      // hence no separate solution file.
      s.solution = '';
      s.log = path.join('.', 'user', 'solver', 'lp_solve.log');
      s.args = [
          '-timeout %T%',
          '-v4',
          '-ac 5e-6',
          '-e %I%',
          '-gr %M%',
          '-epsel 1e-7',
          `-wlp ${s.solver_model}`,
          `>${s.log}`,
          s.user_model
        ];
      // Execute file command differs across platforms.
      s.solve_cmd = (windows ? 'lp_solve.exe ' : './lp_solve ') +
          s.args.join(' ');
      // Function to provide legend to status codes.
      s.statusMessage = (s) => {
        if(s === -2) return 'Out of memory';
        if(s === 9) return 'The model could be solved by presolve';
        if(s === 25) return 'Accuracy error encountered';
        if(s >= 1 && s <= 7) return [
            'The model is sub-optimal',
            'The model is infeasible',
            'The model is unbounded',
            'The model is degenerative',
            'Numerical failure encountered',
            'Solver was stopped by user',
            'Solver time limit exceeded'
          ][s - 1];
        // No message otherwise; if `s` is non-zero, exception is reported.
        return '';
      };
      // For some status codes, solution may be sub-optimal, but useful.
      s.usableSolution = (s) => {
        return [-2, 2, 6].indexOf(s) < 0;
      };
      this.best_solver = this.best_solver || 'lp_solve';
    }
  }
  
  solveBlock(sp) {
    // Save model file, execute solver, and return results.
    const result = {
        block: sp.get('block'),
        round: sp.get('round'),
        status: 0,
        solution: true,
        error: '',
        messages: []
      };
    // Number of columns (= decision variables) is passed to ensure
    // that solution vector is complete and its values are placed in
    // the correct order.
    result.columns = parseInt(sp.get('columns')) || 0;
    // Request may specify a solver ID.
    const sid = sp.get('solver');
    if(sid) {
      this.id = (this.solver_list[sid] ? sid : this.default_solver);
    }
    if(!this.id) {
      result.status = -999;
      result.solution = false;
      result.error = 'No MILP solver';
      return result;
    }
    const s = this.solver_list[this.id];
    console.log('Solve block', result.block, result.round, 'with', s.name);
    // Write the POSTed MILP model to a file.
    fs.writeFileSync(s.user_model, sp.get('data').trim());
    // Delete previous log file (if any).
    try {
      if(s.log) fs.unlinkSync(s.log);
    } catch(err) {
      // Ignore error.
    }
    // Delete previous solution file (if any).
    try {
      if(s.solution) fs.unlinkSync(s.solution);
    } catch(err) {
      // NOTE: MOSEK solution may also be a '.bas' file.
      if(this.id === 'mosek') {
        try {
          fs.unlinkSync(s.solution.replace(/\.int$/, '.bas'));
        } catch(err) {
          // Ignore error.
        }
      }
    }
    let timeout = parseInt(sp.get('timeout')),
        inttol = parseFloat(sp.get('inttol')),
        mipgap = parseFloat(sp.get('mipgap')),
        diagnose = sp.get('diagnose') === 'true';
    // Default timeout per block is 30 seconds.
    if(isNaN(timeout)) timeout = 30;
    // Default integer feasibility tolerance is 5e-7.
    if(isNaN(inttol)) {
      inttol = 5e-7;
    } else {
      inttol = Math.max(1e-9, Math.min(0.1, inttol));
    }
    // Use integer tolerance setting as "near zero" threshold.
    this.near_zero = inttol;
    // Default relative MIP gap is 1e-4.
    if(isNaN(mipgap)) {
      mipgap = 1e-4;
    } else {
      mipgap = Math.max(0, Math.min(0.5, mipgap));        
    }
    return this.runSolver(this.id, timeout, inttol, mipgap, diagnose, result);
  }

  runSolver(id, timeout, inttol, mipgap, diagnose, result) {
    // Set `id` to be the active solver if it is installed, and set the
    // solver parameters. NOTE: These will have been validated.
    this.id = (this.solver_list[id] ? id : this.default_solver);
    let spawn,
        status = 0,
        error = '',
        s = this.solver_list[this.id];
    try {
      if(this.id === 'gurobi') {
        // When using Gurobi, standard spawn with arguments works well.
        s.args[0] = `timeLimit=${timeout}`;
        s.args[1] = `intFeasTol=${inttol}`;
        s.args[2] = `MIPGap=${mipgap}`;
        s.args[3] = `NumericFocus=${diagnose ? 3 : 0}`;
        const options = {windowsHide: true};
        spawn = child_process.spawnSync(s.path, s.args, options);
      } else {
        // MOSEK, CPLEX, SCIP and LP_solve will not work when the arguments
        // are passed as an array. Therefore they are executed with a single
        // command string that includes all arguments.
        // Spawn options must be set such that (1) the command is executed
        // within an OS shell script, (2) output is ignored (warnings should
        // not also appear on the console, and (3) Windows does not open
        // a visible sub-process shell window.
        const
            cmd = s.solve_cmd.replace('%T%', timeout)
                .replace('%I%', inttol).replace('%M%', mipgap),
            options = {shell: true, stdio: 'ignore', windowsHide: true};
        if(this.id === 'cplex') {
          // NOTE: CPLEX must run in user directory.
          options.cwd = 'user/solver';
          // Delete previous solver model file (if any).
          try {
            if(s.solver_model) fs.unlinkSync(s.solver_model);
          } catch(err) {
            // Ignore error when file not found.
          }
        }
        spawn = child_process.spawnSync(cmd, options);
      }
      status = spawn.status;
    } catch(err) {
      status = -13;
      error = err;
    }
    if(status) console.log(`Process status: ${status}`);
    let msg = s.statusMessage(status);  
    if(msg) {
      // If solver exited with known status code, report message.
      result.status = status;
      result.solution = s.usableSolution(status);
      result.error = msg;
    } else if(status !== 0) {
      result.status = -13;
      result.solution = false;
      msg = (error ? error.message : 'Unknown error');
      result.error += 'ERROR: ' + msg;
    }
    return this.processSolverOutput(result);
  }

  processSolverOutput(result) {
    // Read solver output files and return solution (or error).
    const
        x_values = [],
        x_dict = {},
        getValuesFromDict = () => {
          // Return a result vector for as many real numbers (as strings!)
          // as there are columns (0 if not reported by the solver).
          // First sort on variable name (assuming format Xn+).
          const vlist = Object.keys(x_dict).sort();
          // Start with column 1.
          let col = 1;
          for(const v of vlist) {
            // Variable names have zero-padded column numbers, e.g. "X001".
            const vnr = parseInt(v.substring(1));
            // Add zeros for unreported variables until column number matches.
            while(col < vnr) {
              x_values.push(0);
              col++;
            }
            // Return near-zero values as 0.
            let xv = x_dict[v];
            const xfv = parseFloat(xv);
            if(xfv && Math.abs(xfv) < this.near_zero) {
              console.log('NOTE: Truncated ', xfv, ' to zero for variable', v);
              xv = '0';
            }
            x_values.push(xv);
            col++;
          }
          // Add zeros to vector for remaining columns.
          while(col <= result.columns) {
            x_values.push('0');
            col++;
          }
          // No return value; function operates on x_values.
        };

    const s = this.solver_list[this.id];
    let log = '';
    try {
      log = fs.readFileSync(s.log, 'utf8');
    } catch(err) {
      console.log(`Failed to read solver log file ${s.log}`);
    }
    // Solver output has different formats, hence separate routines.
    if(this.id === 'gurobi') {
      // `messages` must be an array of strings.
      result.messages = log.split(os.EOL);
      if(result.status === 1 ||
          (result.status !== 0 && log.indexOf('license') < 0)) {
        // Exit code typically indicates expired license, but also
        // assume this cause when log does not contain the word "license". 
        result.error = 'Your Gurobi license may have expired';
       } else {
        try {
          // Read JSON string from solution file.
          const
              json = fs.readFileSync(s.solution, 'utf8').trim(),
              sol = JSON.parse(json);
          result.seconds = sol.SolutionInfo.Runtime;
          let status = sol.SolutionInfo.Status;
          // NOTE: Status = 2 indicates success!
          if(status !== 2) {
            let msg = s.statusMessage(status);  
            if(msg) {
              // If solver exited with known status code, report message.
              result.status = status;
              result.solution = s.usableSolution(status);
              result.error = msg;
            }
            if(!result.error) result.error = 'Unknown solver error';
            console.log(`Solver status: ${result.status} - ${result.error}`);
          }
          // Objective value.
          result.obj = sol.SolutionInfo.ObjVal || 0;
          // Values of solution vector.
          if(sol.Vars) {
            // Fill dictionary with variable name: value entries.
            for(const sv of sol.Vars) x_dict[sv.VarName] = sv.X;
            // Fill the solution vector, adding 0 for missing columns.
            getValuesFromDict();
          }
        } catch(err) {
          console.log('WARNING: Could not read solution file');
          console.log(err.message);
          result.status = -13;
          result.error = 'No solution found';
        }
      }
    } else if(this.id === 'mosek') {
      let solved = false,
          output = [];
      // `messages` must be an array of strings.
      result.messages = log.split(os.EOL);
      // NOTE: MOSEK may also write solution to 'user_model.bas', so
      // try that as well before reporting failure.
      try {
        output = fs.readFileSync(s.solution, 'utf8').trim();
      } catch(err) {
        try {
          const bas = s.solution.replace(/\.int$/, '.bas');
          output = fs.readFileSync(bas, 'utf8').trim();
        } catch(err) {
          output = '';
        }
      }
      if(!output) {
        console.log('No MOSEK solution file');
      } else if(output.indexOf('SOLUTION STATUS') >= 0) {
        solved = true;
        output = output.split(os.EOL);
      }
      if(solved) {
        // MOSEK saves solution in a proprietary format, so just extract
        // the status and then the variables.
        let i = 0;
        while(i < output.length && output[i].indexOf('CONSTRAINTS') < 0) {
          const o = output[i].split(':');
          if(o[0].indexOf('PRIMAL OBJECTIVE') >= 0) {
            result.obj = o[1].trim();
          } else if(o[0].indexOf('SOLUTION STATUS') >= 0) {
            result.status = o[1].trim();
          }
          i++;
        }
        if(result.status.indexOf('OPTIMAL') >= 0) {
          result.status = 0;
          result.error = '';
        } else if(result.status.indexOf('DUAL_INFEASIBLE') >= 0) {
          result.error = 'Problem is unbounded';
          solved = false;
        } else if(result.status.indexOf('INFEASIBLE') >= 0) {
          result.error = 'Problem is infeasible';
          solved = false;
        }
        if(solved) {
          while(i < output.length && output[i].indexOf('VARIABLES') < 0) {
            i++;
          }
          // Fill dictionary with variable name: value entries.
          while(i < output.length) {
            const m = output[i].match(/^\d+\s+X(\d+)\s+\w\w\s+([^\s]+)\s+/);
            if(m !== null)  {
              const vn = 'X' + m[1].padStart(7, '0');
              x_dict[vn] = parseFloat(m[2]);
            }
            i++;
          }
          // Fill the solution vector, adding 0 for missing columns.
          getValuesFromDict();
        }
      } else {
        console.log('No solution found');
      }
    } else if(this.id === 'cplex') {
      result.seconds = 0;
      const
          no_license = (log.indexOf('No license found') >= 0),
          // NOTE: Omit first letter U, I and P as they may be either in
          // upper case or lower case.
          unbounded = (log.indexOf('nbounded') >= 0),
          infeasible = (log.indexOf('nfeasible') >= 0),
          primal_unbounded = (log.indexOf('rimal unbounded') >= 0),
          err = log.match(/CPLEX Error\s+(\d+):\s+(.+)\./),
          err_nr = (err && err.length > 1 ? parseInt(err[1]) : 0),
          err_msg = (err_nr ? err[2] : ''),
          // NOTE: Solver reports time with 1/100 secs precision.
          mst = log.match(/Solution time \=\s+(\d+\.\d+) sec/);
      if(mst && mst.length > 1) result.seconds = parseFloat(mst[1]);
      // `messages` must be an array of strings.
      result.messages = log.split(os.EOL);
      let solved = false,
          output = [];
      if(no_license) {
        result.error = 'Too many variables for unlicensed CPLEX solver';
        result.status = -13;
      } else if(result.status !== 0) {
        // Non-zero solver exit code indicates serious trouble.
        result.error = 'CPLEX solver terminated with error';
        result.status = -13;
      } else if(err_nr) {
        result.status = err_nr;
        if(infeasible && !primal_unbounded) {
          result.error = 'Problem is infeasible';
        } else if(unbounded) {
          result.error = 'Problem is unbounded';
        } else {
          result.error = err_msg;
        }
      } else {
        try {
          output = fs.readFileSync(s.solution, 'utf8').trim();
          if(output.indexOf('CPLEXSolution') >= 0) {
            solved = true;
            output = output.split(os.EOL);
          }
        } catch(err) {
          console.log('No CPLEX solution file');
        }
      }
      if(solved) {
        // CPLEX saves solution as XML, but for now just extract the
        // status and then the variables.
        let i = 0;
        while(i < output.length) {
          const o = output[i].split('"');
          if(o[0].indexOf('objectiveValue') >= 0) {
            result.obj = o[1];
          } else if(o[0].indexOf('solutionStatusValue') >= 0) {
            result.status = o[1];
          } else if(o[0].indexOf('solutionStatusString') >= 0) {
            result.error = o[1];
            break;
          }
          i++;
        }
        // CPLEX termination codes 1, 101 and 102 indicate success.
        if(['1', '101', '102'].indexOf(result.status) >= 0) {
          result.status = 0;
          result.solution = true;
          result.error = '';
        }
        // Fill dictionary with variable name: value entries.
        while(i < output.length) {
          const m = output[i].match(/^.*name="(X[^"]+)".*value="([^"]+)"/);
          if(m !== null)  x_dict[m[1]] = parseFloat(m[2]);
          i++;
        }
        // Fill the solution vector, adding 0 for missing columns.
        getValuesFromDict();
      } else {
        console.log('No solution found');
      }
    } else if(this.id === 'scip') {
      result.seconds = 0;
      // `messages` must be an array of strings.
      result.messages = log.split(os.EOL);
      let solved = false,
          output = [];
      if(result.status !== 0) {
        // Non-zero solver exit code indicates serious trouble.
        result.error = 'SCIP solver terminated with error';
      } else {
        try {
          output = fs.readFileSync(
              s.solution, 'utf8').trim().split(os.EOL);
        } catch(err) {
          console.log('No SCIP solution file');
        }
        // Look in messages for solver status and solving time.
        for(const m of result.messages) {
          if(m.startsWith('SCIP Status')) {
            if(m.indexOf('problem is solved') >= 0) {
              if(m.indexOf('infeasible') >= 0) {
                result.status = (m.indexOf('unbounded') >= 0 ? 14 : 12);
              } else if(m.indexOf('unbounded') >= 0) {
                result.status = 13;
              } else {
                solved = true;
              }
            } else if(m.indexOf('interrupted') >= 0) {
              if(m.indexOf('time limit') >= 0) {
                result.status = 5;
              } else if(m.indexOf('memory limit') >= 0) {
                result.status = 6;
              }
            }
            if(result.status) {
              let msg = s.statusMessage(result.status);  
              if(msg) {
                // If solver exited with known status code, report message.
                result.solution = s.usableSolution(result.status);
                result.error = msg;
              }
              if(!result.error) result.error = 'Unknown solver error';
              console.log(`Solver status: ${result.status} - ${result.error}`);
            }
          } else if (m.startsWith('Solving Time')) {
            result.seconds = parseFloat(m.split(':')[1]);
          }
        }
      }
      if(solved) {
        // Line 0 holds solution status, line 1 the objective value,
        // and lines 2+ the variables.
        result.obj = parseFloat(output[1].split(':')[1]);
        // Fill dictionary with variable name: value entries .
        for(let i = 2; i < output.length; i++) {
          const v = output[i].split(/\s+/);
          x_dict[v[0]] = parseFloat(v[1]);
        }
        // Fill the solution vector, adding 0 for missing columns.
        getValuesFromDict();
      } else {
        console.log('No solution found');
      }
    } else if(this.id === 'lp_solve') {
      const
          // NOTE: LP_solve both messages and solution console, hence
          // the log file is processed in two "stages".
          output = log.trim().split(os.EOL),
          // NOTE: Linny-R client expects log messages as list of strings.
          msgs = [];
      result.seconds = 0;
      let i = 0,
          solved = false;
      while(i < output.length && !solved) {
        // All output lines are "log lines"...
        msgs.push(output[i]);
        const m = output[i].match(/in total (\d+\.\d+) seconds/);
        if(m && m.length > 1) result.seconds = parseFloat(m[1]);
        // ... until the value of the objective function is detected.
        solved = output[i].startsWith('Value of objective function:');
        i++;
      }
      result.messages = msgs;
      if(solved) {
        // Get value of objective function
        result.obj = parseFloat(output[i].split(':')[1]);
        // Look for line with first variable.
        while(i < output.length && !output[i].startsWith('X')) i++;
        // Fill dictionary with variable name: value entries.
        while(i < output.length) {
          const v = output[i].split(/\s+/);
          x_dict[v[0]] = parseFloat(v[1]);
          i++;
        }
        // Fill the solution vector, adding 0 for missing columns.
        getValuesFromDict();
      } else {
        console.log('No solution found');
      }
    }
    
    // Add data and model to the results dict
    result.data = {
        block: result.block,
        round: result.round,
        seconds: result.seconds,
        x: x_values
      };
    try {
      result.model = fs.readFileSync(s.solver_model, 'utf8');
    } catch(err) {
      console.log(err.toString());
      result.model = 'ERROR reading solver model file: ' + err;
    }
    if(result.error) console.log('Solver error:', result.error);
    return result;
  }

}; // END of class MILPSolver (semicolon needed because of export statement)
