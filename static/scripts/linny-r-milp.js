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

const
    child_process = require('child_process'),
    fs = require('fs'),
    os = require('os'),
    path = require('path');

// Class MILPSolver implements the connection with the solver
module.exports = class MILPSolver {
  constructor(settings, workspace) {
    this.name = settings.solver;
    this.solver_path = settings.solver_path;
    console.log(`Selected solver: "${this.name}"`);
    this.id = this.name.toLowerCase();
    // Each external MILP solver application has its own interface
    // NOTE: the list may be extended to accommodate more MILP solvers
    if(this.id === 'gurobi') {
      this.ext = '.mps';
      this.user_model = path.join(workspace.solver_output, 'usr_model.mps');
      this.solver_model = path.join(workspace.solver_output, 'solver_model.lp');
      this.solution = path.join(workspace.solver_output, 'model.json');
      this.log = path.join(workspace.solver_output, 'model.log');
      this.args = [
          'timeLimit=30',
          'intFeasTol=0.5e-6',
          'JSONSolDetail=1',
          `LogFile=${this.log}`,
          `ResultFile=${this.solution}`,
          `ResultFile=${this.solver_model}`,
          `${this.user_model}`
        ];
      this.errors = {
        1: 'Model loaded -- no further information',
        2: 'Optimal solution found',
        3: 'The model is infeasible',
        4: 'The model is either unbounded or infeasible',
        5: 'The model is unbounded',
        6: 'Aborted -- Optimal objective is worse than specified cut-off',
        7: 'Halted -- Iteration limit exceeded',
        8: 'Halted -- Node limit exceeded',
        9: 'Halted -- Solver time limit exceeded',
       10: 'Halted -- Solution count limit exceeded',
       11: 'Halted -- Optimization terminated by user',
       12: 'Halted -- Unrecoverable numerical difficulties',
       13: 'The model is sub-obtimal',
       14: 'Optimization still in progress',
       15: 'User-specified objective limit has been reached'
      };
    } else if(this.id === 'lp_solve') {
      // Execute file commands differ across platforms
      if(os.platform().startsWith('win')) {
        this.solve_cmd = 'lp_solve.exe ';
      } else {
        this.solve_cmd = './lp_solve ';
      }
      this.ext = '.lp';
      this.user_model = path.join('user', 'solver', 'usr_model.lp');
      this.solver_model = path.join('user', 'solver', 'solver_model.lp');
      this.solution = path.join('.', 'user', 'solver', 'output.txt');
      this.args = [
          '-timeout 300',
          '-v4',
          '-g 1.0e-11',
          '-epsel 1.0e-7',
          `-wlp ${this.solver_model}`,
          `>${this.solution}`,
          this.user_model
        ];
      this.errors = {
        '-2': 'Out of memory',
           1: 'The model is sub-optimal',
           2: 'The model is infeasible',
           3: 'The model is unbounded',
           4: 'The model is degenerative',
           5: 'Numerical failure encountered',
           6: 'Solver was stopped by user',
           7: 'Solver time limit exceeded',
           9: 'The model could be solved by presolve',
          25: 'Accuracy error encountered'  
       };
    } else {
      console.log(`WARNING: Unknown solver "${this.name}"`);
      this.id = '';
    }
  }
  
  test() {
    // Tests whether solver is working; for Gurobi this means that
    // the license must be valid.
    try {
      let spawn = null,
          status = 0;
      if(this.id === 'lp_solve') {
        const
            cmd = this.solve_cmd + ' -h',
            options = {shell: true, stdio: 'ignore', windowsHide: true};
        spawn = child_process.spawnSync(cmd,  options);
      } else {          
        const options = {windowsHide: true};
        spawn = child_process.spawnSync(this.solver_path, [], options);
      }
      status = spawn.status;
    } catch(err) {
      status = -13;
    }
    console.log(`Solver test process status: ${status}`);
    return status === 0;
  }

  solveBlock(sp) {
    // Saves model file, executes solver, and returns results
    const result = {
        block: sp.get('block'),
        round: sp.get('round'),
        status: 0,
        error: '',
        messages: []
      };
    let timeout = parseInt(sp.get('timeout'));
    // Default timeout per block is 30 seconds
    if(isNaN(timeout)) timeout = 30;
    if(!this.id) {
      result.status = -999;
      result.error = 'No MILP solver';
      return result;
    } else {
      console.log('Solve block', result.block, result.round);
      // Write the POSTed MILP model to a file
      fs.writeFileSync(this.user_model, sp.get('data').trim());
      // Delete previous log file (if any)
      try {
        if(this.log) fs.unlinkSync(this.log);
      } catch(err) {
        // Ignore error
      }
      // Delete previous solution file (if any)
      try {
        if(this.solution) fs.unlinkSync(this.solution);
      } catch(err) {
        // Ignore error
      }
      let spawn = null,
          error = null,
          status = 0;
      try {
        if(this.id === 'lp_solve') {
          this.args[0] = '-timeout ' + timeout;
          // NOTES:
          // (1) LP_solve is picky about its command line, and will not work
          //     when the arguments are passed as an array; therefore execute
          //     it as a single command string that includes all arguments
          // (2) the shell option must be set to TRUE (so the command is
          //     executed within an OS shell script) or LP_solve will interpret
          //     the first argument as the model file, and complain
          // (3) output must be ignored, as LP_solve will output many warnings
          //     about 0-value coefficients, and these would otherwise also
          //     appear on the console
          // (4) prevent Windows opening a visible sub-process shell window
          const
              cmd = this.solve_cmd + ' ' + this.args.join(' '),
              options = {shell: true, stdio: 'ignore', windowsHide: true};
          spawn = child_process.spawnSync(cmd,  options);
        } else {          
          this.args[0] = 'TimeLimit=' + timeout;
          // When using Gurobi, the standard way works well
          const options = {windowsHide: true};
          spawn = child_process.spawnSync(this.solver_path, this.args, options);
        }
        status = spawn.status;
      } catch(err) {
        status = -13;
        error = err;
      }
      if(status) console.log(`Process status: ${status}`);
      if(status in this.errors) {
        // If solver exited with known status code, report message
        result.status = status;
        result.error = this.errors[status];
      } else if(status !== 0) {
        result.status = -13;
        const msg = (error ? error.message : 'Unknown error');
        result.error += 'ERROR: ' + msg;
      }
      return this.processSolverOutput(result);
    }
  }
  
  processSolverOutput(result) {
    // Read solver output files and return solution (or error)
    const x_values = [];
    if(this.id === 'gurobi') {
      // `messages` must be an array of strings
      result.messages = fs.readFileSync(this.log, 'utf8').split(os.EOL);
      if(result.status !== 0) {
        // Non-zero solver exit code may indicate expired license
        result.error = 'Your Gurobi license may have expired';
      } else {
        try {
          // Read JSON string from solution file
          const
              json = fs.readFileSync(this.solution, 'utf8').trim(),
              sol = JSON.parse(json);
            result.seconds = sol.SolutionInfo.Runtime;
          // NOTE: Status = 2 indicates success!
          if(sol.SolutionInfo.Status !== 2) {
            result.status = sol.SolutionInfo.Status;
            result.error = this.errors[result.status];
            if(!result.error) result.error = 'Unknown solver error';
            console.log(`Solver status: ${result.status} - ${result.error}`);
          }
          // Objective value
          result.obj = sol.SolutionInfo.ObjVal;
          // Values of solution vector
          if(sol.Vars) {
            for(let i = 0; i < sol.Vars.length; i++) {
              x_values.push(sol.Vars[i].X);
            }
          }
        } catch(err) {
          console.log('WARNING: Could not read solution file');
          console.log(err.message);
          result.status = -13;
          result.error = 'No solution found';
        }
      }
    } else if(this.id === 'lp_solve') {
      // Read solver messages from file
      // NOTE: Linny-R client expects a list of strings
      const
          output = fs.readFileSync(
              this.solution, 'utf8').trim().split(os.EOL),
          msgs = [];
      result.seconds = 0;
      let i = 0,
          solved = false;
      while(i< output.length && !solved) {
        msgs.push(output[i]);
        const m = output[i].match(/in total (\d+\.\d+) seconds/);
        if(m && m.length > 1) result.seconds = parseFloat(m[1]);
        solved = output[i].startsWith('Value of objective function:');
        i++;
      }
      result.messages = msgs;
      if(solved) {
        while(i < output.length && !output[i].startsWith('C1')) i++;
        while(i < output.length) {
          let v = output[i].replace(/C\d+\s*/, '');
          // Remove variable names from result output
          v = parseFloat(v);
          x_values.push(v);
          i++;
        }
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
      result.model = fs.readFileSync(this.solver_model, 'utf8');
    } catch(err) {
      console.log(err);
      result.model = 'ERROR reading solver model file: ' + err;
    }
    return result;
  }

}; // END of class MILPSolver (semicolon needed because of export statement)
