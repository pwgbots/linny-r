<img src="https://sysmod.tbm.tudelft.nl/linny-r/images/logo.png"
     height="55px" alt="Linny-R">

Linny-R is an executable graphical specification language for mixed integer 
<a href="https://en.wikipedia.org/wiki/Linear_programming"
   target="_blank">linear programming</a> (MILP) problems, especially
<a href="https://en.wikipedia.org/wiki/Unit_commitment_problem_in_electrical_power_production"
   target="_blank">unit commitment problems</a>
(UCP) and
<a href="https://en.wikipedia.org/wiki/Generation_expansion_planning"
   target="_blank">generation expansion planning</a> (GEP).

The graphical language and WYSIWYG model editor are developed by **Pieter Bots**
at <a href="https://tudelft.nl" target="_blank">Delft University of Technology</a>.
 
Originally implemented in Delphi Pascal, Linny-R is now developed in
HTML+CSS+JavaScript so as to be platform-independent and 100% transparent
open source (under the MIT license). The software comprises a server that
runs on **Node.js**, and a graphical user interface (GUI) that runs in any
modern browser.

These <a href="https://sysmod.tbm.tudelft.nl/linny-r/docs/?68"
         target="_blank">instruction videos</a> published on YouTube give
an idea of what Linny-R can do.

User documentation for Linny-R is still scant. A book "Modeling and
simulation with Linny-R" will be published by TU Delft OPEN in 2024.
Meanwhile, you can consult the official user documentation site
<a href="https://linny-r.info" target="_blank">https://linny-r.info</a>.
Technical documentation will be developed in due time on GitHub:
https://github.com/pwgbots/linny-r/wiki

## Installing Node.js

Linny-R is developed as a JavaScript package, and requires that **Node.js**
is installed on your computer. This software can be downloaded from
<a href="https://nodejs.org" target="_blank">https://nodejs.org</a>. 
Make sure that you choose the correct installer for your computer.
Linny-R is developed using the _current_ release. Presently (June 2024)
this is 22.2.0. 

Run the installer and accept the default settings.
There is <u>**no**</u> need to install the optional _Tools for Native Modules_.

Open the Command Line Interface (CLI) of your computer. 
On macOS, this will be `Terminal`, on Windows `Command Prompt`. 
Verify the installation by typing:

``node --version``

The response should be the version number of Node.js, for example: v22.2.0.

## Installing Linny-R
It is advisable to install Linny-R in a directory on your computer, **not**
in a cloud. 

In this installation guide, the path to this directory is denoted by `Linny-R`,
so in all commands you should replace this with the actual directory path.
On a Windows machine the suggested path is `C:\Users\(your user name)\Documents\Linny-R`,
and on a macOS machine `/Users/(your user name)/Linny-R`.

To install Linny-R in this directory, first change to the parent directory
like so:

``cd /Users/(your user name)``

Then create the `Linny-R` directory:

``mkdir Linny-R``

then change to it:

``cd Linny-R``

and then type at the command line prompt: 

``npm install --prefix . linny-r``

> [!IMPORTANT]
> The spacing around the dot is essential. Type the command in lower case.

After installation has completed, `Linny-R` should have this directory tree
structure:

<pre>
Linny-R
 |
 +-node_modules
    |
    +-@xmldom
    |
    +-linny-r
       |
       +-static
          |
          +-fonts
          |
          +-images
          |
          +-scripts
          |
          +-sounds
</pre>

`Linny-R` should contain two JSON files `package.json` and `package-lock.json`
that should **not** be removed, or you will have to re-install Linny-R.

The `linny-r` directory should also contain this file `README.md`,
the files `server.js` and `console.js` that will be run by Node.js,
and the sub-directory `static`. This `static` directory should contain three
HTML files: 

* `index.html` (the browser-based GUI) 
* `show-png.html` (to render SVG diagrams as PNG images)
* `show-diff.html` (to display differences betwee two Linny-R models)

It should also contain the style sheet `linny-r.css` required by the GUI.

The sub-directories of `static` contain files that are served to the browser
by the script `server.js` when it is running in Node.js. 

#### Installing and using an earlier version of Linny-R

By default, **npm** will install the latest release of the Linny-R software.
As this software is developed as part of academic research, new features
are added without rigorous testing. Although much effort is dedicated to
maintaining upward and downward compatibility, you may find that the latest
version does not work as well for you as some earlier version. To re-install
an earlier release, for example version 1.9.3, open the CLI, change to your
`Linny-R` directory, and then type:

``npm install linny-r@1.9.3``

> [!NOTE]
> This will overwrite the contents of the `node_modules` directory, but
> it will not affect the files in your user space.

If you prefer to have different versions of Linny-R on your computer, you
can create a separate directory for a specific version, then change to this
directory and type:

``npm install --prefix . linny-r@1.9.3``

> [!NOTE]
> To run a specific version in your browser, you must start the server from
> the directory where you installed this version.
> Should you wish to run two different versions concurrently, you must use
> the `port=[number]` option when you start the server for the second version.

## Configuring the MILP solver

Linny-R presently supports five MILP solvers: Gurobi, MOSEK, CPLEX, SCIP
and LP_solve. Gurobi, MOSEK and CPLEX are _considerably_ more powerful than
the open source solvers SCIP and LP_solve, but they require a license.
Academic licenses can be obtained by students and staff of eligible
institutions.

> [!IMPORTANT]
> When installing a solver, it is advisable to accept the default file
> locations that are proposed by the installer.
> After installation, do **not** move files to some other directory,
> as this is bound to cause problems.

#### Installing Gurobi

The software you need to install is **Gurobi Optimizer**.
More information on how to obtain a license, and instructions for installing
Gurobi on your computer can be obtained via this URL:
<a href="https://www.gurobi.com/academia/academic-program-and-licenses/"
   target="_blank">https://www.gurobi.com/academia/academic-program-and-licenses/</a>

When running a model, Linny-R will try to execute the command line application
`gurobi_cl`. It will look for this application in the directory specified in
the environment variable PATH on your computer.

#### Installing CPLEX

The software you need to install is **CPLEX**.
More information on how to obtain a license, and instructions for installing
CPLEX on your computer can be obtained via this URL:
<a href="https://www.ibm.com/products/ilog-cplex-optimization-studio"
   target="_blank">https://www.ibm.com/products/ilog-cplex-optimization-studio</a>

When running a model, Linny-R will try to execute the command line application
`cplex`. It will look for this application in the directory specified in the
environment variable PATH or more specifically in the environment variable
CPLEX_STUDIO_BINARIES<em>nnnn</em> (where _nnnn_ denotes the CPLEX version
number) on your computer.

#### Installing MOSEK

The software you need to install is **MOSEK**.
More information on how to obtain a license, and instructions for installing
MOSEK on your computer can be obtained via this URL:
<a href="https://www.mosek.com/resources/getting-started/"
   target="_blank">https://www.mosek.com/resources/getting-started/</a>

When running a model, Linny-R will try to execute the command line application
`mosek`. It will look for this application in the directory specified in the
environment variable PATH on your computer.

#### Installing SCIP

The SCIP software is open source. Instructions for installation can be found
via this URL: <a href="https://scipopt.org/doc/html/INSTALL.php"
                 target="_blank">https://scipopt.org/doc/html/INSTALL.php</a>

When running a model, Linny-R will try to execute the command line application
`scip`. It will look for this application in the directory specified in the
environment variable PATH on your computer.

#### Installing LP_solve

The LP_solve software is open source and can be downloaded via this URL:
<a href="https://sourceforge.net/projects/lpsolve"
   target="_blank">https://sourceforge.net/projects/lpsolve</a>

To facilitate installation, the executable files for Windows and macOS can
be downloaded from the Linny-R website at Delft University of Technology:
<a href="https://sysmod.tbm.tudelft.nl/linny-r/lp_solve"
   target="_blank">https://sysmod.tbm.tudelft.nl/linny-r/lp_solve</a>

There you will find links to download LP_solve applications that have been
compiled for different platforms. If you do not know which platform to choose,
run Linny-R as described below, and the platform will be listed in its output.
If no matching LP_solve version is listed, you can try to compile the software
from its source. How to do this is explained on the page "Installing LP_solve
on a Mac" on the Linny-R documentation site:
<a href="https://linny-r.info" target="_blank">https://linny-r.info</a> 

When you have downloaded the file (just `lp_solve` for macOS, `lp_solve.exe`
for Windows), you must copy or move this file to your `Linny-R` directory,
as this is where Linny-R will look for it when it does not find one of the
other solvers.

On a macOS machine, you must then make the file `lp_solve` executable.
Open `Terminal` and change to your Linny-R directory, and then type:

``chmod +x lp_solve``

When you then type:

``./lp_solve -h``

a window may appear that warns you that the software may be malicious.
To allow running LP_solve, you must then go to _Security & Privacy_ (via
_System Preferences_) and there click the _Open Anyway_ button in the _General_
pane to confirm that you wish to use LP_solve. Then return to `Terminal`
and once more type `./lp_solve -h`. The response should then be a listing
of all the command line options of LP_solve. If you reach this stage,
Linny-R will be able to run LP_solve.

## Running Linny-R

On a Windows machine, open `Command Prompt`, change to your Linny-R
directory and type:

``linny-r``

On a macOS machine, open `Terminal`, change to your Linny-R directory
and type:

``./linny-r.command``

This should run the launch script for Linny-R, which will start the
local server script that connects your browser with the solver. 
Meanwhile, your default web browser should have opened a tab for the local
server URL, which by default will be http://127.0.0.1:5050.
The Linny-R GUI should show in your browser window, while in the CLI you
should see a long series of server log messages like:

<pre>
[2024-06-11 22:55:17] Static file: /index.html
[2024-06-11 22:55:17] Static file: /scripts/iro.min.js
[2024-06-11 22:55:17] Static file: /images/open.png
... etc.
</pre>

> [!IMPORTANT]
> Do **not** close the CLI. If you do, the Linny-R GUI may still be
> visible in your browser, but you will be warned that it cannot connect
> to the server (at 127.0.0.1:5050). This means that you have to restart
> Linny-R as described above.

After loading into the browser, Linny-R will try to connect to the solver.
If successful, a notification (blue background) will appear on the status
bar at the bottom of the window, stating the name of the solver.

You can then test the GUI by creating a simple model.
Make one that has at least one process that outputs a product, 
and this product must have a price or a set lower bound, otherwise the
model will have no objective function.
Then click on the _Solve_ button at the bottom of the left-hand tool bar.
The Linny-R icon in the upper left corner should start rotating, while the
status bar at the bottom should display:

<pre>
Solving block 1 of 1
</pre>

For a small test model, this message should appear only very briefly,
and then the diagram will be updated to reflect the obtained solution.
Meanwhile, in the CLI, you should see a server log message like:

<pre>
Solve block 1 a with SCIP
</pre>

To end a modeling session, you can shut down the server by clicking on the
local host icon in the upper right corner of the Linny-R GUI in your browser,
confirming that you want to leave, and then closing your browser (tab).
If you do not shut down the server from the browser, you can also stop the
server by repeatedly pressing ``Ctrl+C`` in the CLI.

## Click-start for Linny-R

When `npm` installs the Linny-R package, it creates a script file in your
Linny-R directory that will allow you to start Linny-R by clicking its
icon on your machine. On a macOS machine, this will will be the shell
script `linny-r.command`, on a Windows machine the batch script
`linny-r.bat`.

To facilitate start-up, you can create a shortcut icon for Linny-R on your
desktop.

On a Windows machine, open the `File Explorer`, select your Linny-R folder,
right-click on the batch file `linny-r.bat`, and select the _Create shortcut_
option. Then right-click on the shortcut file to edit its properties, and
click the _Change Icon_ button. The dialog that then appears will allow
you to go to the sub-folder `node_modules\linny-r\static\images`, where
you should select the file `linny-r.ico`. Finally, rename the shortcut to
`Linny-R` and move or copy it to your desktop.

On a macOS machine, open `Terminal` and change to your Linny-R directory,
and then type:

``chmod +x linny-r.command``

to make the script file executable. To set the icon, use Finder to open
the folder that contains the file `linny-r.command`, click on its icon
(which still is plain) and open the _Info dialog_ by pressing ``Cmd+I``.
Then open your Linny-R folder in Finder, change to the sub-folder
`node_modules/linny-r/static/images`, and from there drag/drop the file
`linny-r.icns` on the icon shown in the top left corner of the _Info dialog_.

## Command line options

You can customize Linny-R by adding more arguments to the `node` command
in the launch script:

<pre>
dpi=[number]       to overrule the default resolution (300 dpi) for Inkscape 
launch             to automatically launch Linny-R in your default browser
port=[number]      to overrule the default port number (5050)
solver=[name]      to overrule the default sequence (Gurobi, MOSEK, CPLEX, SCIP, LP_solve)
workspace=[path]   to overrule the default path for the user directory
</pre>

> [!NOTE]
> When configuring Linny-R for a network environment where individual users
> each have their personal work space (e.g., a virtual drive U:), you **must**
> edit the launch script file, adding the argument `workspace=path/to/workspace`
> to the `node` command. This will instruct Linny-R to create the `user`
> directory in this workspace directory instead of the Linny-R directory.

## User workspace

The user workspace is created when the server is run for the first time.
The sub-directories of this directory `user` are used by Linny-R to store files.

* `autosave` will contain models that have been _auto-saved_ 
* `channel` and `callback` will be used to interact with Linny-R via its _Receiver_ 
* `data` will be used by the _Dataset Manager_ to locate datasets for which
  a path has been specified
* `diagrams` will be used to render Scalable Vector Graphics (SVG) files as
  Portable Network Graphics (PNG) using Inkscape (if installed)
* `models` will contain models that you saved by Shift-clicking on the
  _Save_ button, or using the keyboard shortcut Ctrl-Shift-S
* `modules` will contain models stored in the `local host` _repository_
* `reports` will contain text files with time series data and statistics in
  tab-separated format that can be imported or copy/pasted into Excel
* `solver` will contain the files that are exchanged with the Mixed Integer
  Linear Programming (MILP) solver (the names of the files that will appear
  in this directory may vary, depending on the MILP-solver you use)

> [!NOTE]
> By default, the `user` directory is created in your `Linny-R` directory.
> You can overrule this by starting the server with the `workspace=[path]`
> option. This will create a new, empty workspace in the specified path.
> It will **not** affect or duplicate information from existing workspaces.

## Installing Inkscape

Linny-R creates its diagrams and charts as SVG images. 
When you download a diagram, it will be saved as a .svg file.
These files can be viewed and edited using Inkscape, an open source
vector graphics editor. 

As it may be tedious to first save a diagram as SVG and then render it
manually as a bitmap image, Linny-R features a *Render diagram as bitmap*
button on the top toolbar, and on the bottom toolbar of the _Chart manager_.
When you click it, Linny-R will send the image as SVG to the server. 
The server script will save the SVG in the `user/diagrams` sub-directory, 
and then try to execute an Inkscape command that will convert this SVG to
a PNG image file in the same directory.
The file name will be `diagram-(date and time).png`. 
Meanwhile, the browser will have opened a new tab that will be "waiting"
for this PNG image to become available. 
If rendering was successful, the image will appear in this browser tab; 
if rendering failed, the original SVG image will be shown.

To install Inkscape, please look here:
<a href="https://inkscape.org/release"
   target="_blank">https://inkscape.org/release</a>

Linny-R will automatically detect whether Inkscape is installed by searching
for it in the environment variable PATH on your computer. On a macOS computer,
Linny-R will look for Inkscape in `/Applications/Inkscape.app/Contents/MacOS`.

> [!NOTE]
> The installation wizard for Inkscape (version 1.3) may **not**
> add the application to the PATH variable. Please check whether you need to
> do this yourself.

## Using Linny-R console

The console-only version of Linny-R allows you to run a Linny-R model without
a web browser. This may be useful when you want run models from a script
(shell script, Python, ...). If you open a CLI box, change to your `Linny-R`
directory, and then type:

``node node_modules/linny-r/console``  _(on Windows, use backslashes)_

you will see the command line options that allow you to run models in various
ways.

> [!NOTE]
> The console-only version is still in development, and does not provide
> all functions yet.

## Troubleshooting problems

If during any of the steps above you encounter problems, please try to
diagnose them and resolve them yourself. You can find a lot of useful
information on the Linny-R user documentation website:
<a href="https://linny-r.info" target="_blank">https://linny-r.info</a>.

> [!IMPORTANT]
> To diagnose a problem, always look in the CLI box where Node.js is running, 
> as informative server-side error messages will appear there.

Then also look at the console window of your browser. 
Most browsers offer a _Web Developer Tools_ option via their application menu.
This will allow you to view the browser console, which will display JavaScript
errors in red font.

If you've tried hard, but failed, you can try to contact Pieter Bots at
``p.w.g.bots@tudelft.nl``
