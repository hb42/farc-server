param (
    [Parameter(Mandatory=$True)][String]$user,
    [Parameter(Mandatory=$True)][String]$pass
)

# Aktionen, bevor der Verzeichnisbaum neu eingelesen wird

##
# mongodb-dump
#
# Dump-Verzeichnis (je Wochentag eines)
[int]$dumpNr = (Get-Date).DayOfWeek
$dumpDir = "farc_dump.${dumpNr}"

# dump
try {
    cd "${PSScriptRoot}/../.."
    # vorhandenes Verzeichnis loeschen
    rm $dumpDir -Force -Recurse -ErrorAction SilentlyContinue
    $out = & "D:\Program Files\MongoDB\Server\4.0\bin\mongodump.exe" /d farc /o $dumpDir /u $user /p $pass /gzip 2>&1
} catch {
    $out = $_.Exception.Message
}
# restore
# & "d:\Program Files\MongoDB\Server\4.0\bin\mongorestore.exe" /d farc /drop /u $user /p $pwd /gzip farc_dump.x\farc\
#

# nur so werden die Umlaute sauber ausgegeben
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
foreach($l in $out) {
    [Console]::WriteLine($l)
}
