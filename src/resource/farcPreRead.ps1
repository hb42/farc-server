param (
    [Parameter(Mandatory=$True)][String]$user,
    [Parameter(Mandatory=$True)][String]$pwd
)

# Aktionen, bevor der Verzeichnisbaum neu eingelesen wird

# dump
# & 'C:\Program Files\MongoDB\Server\4.0\bin\mongodump.exe' -d farc -o farc_dump -u $user -p $pwd --gzip
# restore
# & 'C:\Program Files\MongoDB\Server\4.0\bin\mongorestore.exe' -d farc --drop -u $user -p $pwd --gzip farc_dump\farc\

"test"
