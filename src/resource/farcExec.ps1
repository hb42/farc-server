param (
  [Parameter(Mandatory=$True)][String]$source,
  [Parameter(Mandatory=$True)][String]$target, 
                              [String]$file,
  [Parameter(Mandatory=$True)]
  [ValidateSet("copy", "move", "delete", IgnoreCase = $false)][String]$type
)

##
# Beenden mit errorlevel $exitcode
#
# z.B. ExitWithCode -exitcode $LastExitCode
# -> $LastExitCode enthaelt den errorlevel des letzten 
#    externen Befehls
##
function ExitWithCode {
  param (
    $exitcode
  )
  $host.SetShouldExit($exitcode)
  exit $exitcode
} 

<### robocopy ################################################################

The return code from Robocopy is a bitmap, defined as follows:

    Hex   Decimal  Meaning if set

    0×00   0       No errors occurred, and no copying was done.
                   The source and destination directory trees are completely synchronized. 

    0×01   1       One or more files were copied successfully (that is, new files have arrived).

    0×02   2       Some Extra files or directories were detected. No files were copied
                   Examine the output log for details. 

    0×04   4       Some Mismatched files or directories were detected.
                   Examine the output log. Housekeeping might be required.

    0×08   8       Some files or directories could not be copied
                   (copy errors occurred and the retry limit was exceeded).
                   Check these errors further.

    0×10  16       Serious error. Robocopy did not copy any files.
                   Either a usage error or an error due to insufficient access privileges
                   on the source or destination directories.

These can be combined, giving a few extra exit codes:

    0×03   3       (2+1) Some files were copied. Additional files were present. No failure was encountered.

    0×05   5       (4+1) Some files were copied. Some files were mismatched. No failure was encountered.

    0×06   6       (4+2) Additional files and mismatched files exist. No files were copied and no failures were encountered.
                   This means that the files already exist in the destination directory

    0×07   7       (4+1+2) Files were copied, a file mismatch was present, and additional files were present.

Any value greater than 7 indicates that there was at least one failure during the copy operation.

You can use this in a batch file to report anomalies, as follows:

    if %ERRORLEVEL% EQU 16 echo ***FATAL ERROR*** & goto end
    if %ERRORLEVEL% EQU 15 echo OKCOPY + FAIL + MISMATCHES + XTRA & goto end
    if %ERRORLEVEL% EQU 14 echo FAIL + MISMATCHES + XTRA & goto end
    if %ERRORLEVEL% EQU 13 echo OKCOPY + FAIL + MISMATCHES & goto end
    if %ERRORLEVEL% EQU 12 echo FAIL + MISMATCHES& goto end
    if %ERRORLEVEL% EQU 11 echo OKCOPY + FAIL + XTRA & goto end
    if %ERRORLEVEL% EQU 10 echo FAIL + XTRA & goto end
    if %ERRORLEVEL% EQU 9 echo OKCOPY + FAIL & goto end
    if %ERRORLEVEL% EQU 8 echo FAIL & goto end
    if %ERRORLEVEL% EQU 7 echo OKCOPY + MISMATCHES + XTRA & goto end
    if %ERRORLEVEL% EQU 6 echo MISMATCHES + XTRA & goto end
    if %ERRORLEVEL% EQU 5 echo OKCOPY + MISMATCHES & goto end
    if %ERRORLEVEL% EQU 4 echo MISMATCHES & goto end
    if %ERRORLEVEL% EQU 3 echo OKCOPY + XTRA & goto end
    if %ERRORLEVEL% EQU 2 echo XTRA & goto end
    if %ERRORLEVEL% EQU 1 echo OKCOPY & goto end
    if %ERRORLEVEL% EQU 0 echo No Change & goto end
    :end  

  Das Quellverzeichnis wird nicht angelegt

    source: /dir1/dir2
    target: /dir3
    /e kopiert dir2/* nach dir3/* -> es wird NICHT dir2 angelegt
    um dir2 zu kopieren: robocopy /dir1/dir2 /dir3/dir2 /e 

  Hier verwendete Parameter

    /r:10 /w:1 max. 10 Wiederholungen mit Verzoegerung 1sec
    /np keinen Fortschritt protokollieren
    Kopieren + Verschieben:
    /e mit Unterverzeichnissen incl. leerer
    Verschieben:
    /move Dateien und Verzeichnisse verschieben (kopiern, dann loeschen)

#>
$rc = 0
$out = ""
#
# Loeschen
#
if ($type -eq "delete") {
  try {
    if ($file) {  # Datei
      $del = $source + "\" + $file
      $out = Remove-Item $del -Force -Verbose -ErrorAction Stop
    } else {      # Verzeichnis
      $out = Remove-Item $source -Recurse -Force -Verbose -ErrorAction Stop  
    }
    $rc = 0
  } catch {
    $rc = 1
    $out = $_.Exception.Message
  }
#
# Verschieben/ Kopieren 
# 
} else {
  $prog = "robocopy"
  $parm_std = @("/r:10", "/w:1", "/np")
  $parm_dircp = @("/e")
  $parm_mv = @("/move")

  $arg = $parm_std
  if ($type -eq "move") {
    $arg += $parm_mv
  }
  if ($file) {  # Datei
    $out = & $prog "${source}" "${target}" "${file}" $arg 2>&1
  } else {      # Verzeichnis
    $arg += $parm_dircp
    $out = & $prog "${source}" "${target}" $arg 2>&1
  }
  $result = $LastExitCode
  #$out += "  #*#RC=${result}#*#"
  if ($result -gt 7) {
    $rc = 1
  } else {
    $rc = 0
  }
}
 
# nur so werden die Umlaute sauber ausgegeben
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
foreach($l in $out) {
  [Console]::WriteLine($l)
}

ExitWithCode -exitcode $rc
