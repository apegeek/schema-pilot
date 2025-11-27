param(
  [int]$Port = 4000
)
$here = Split-Path -Parent $MyInvocation.MyCommand.Definition
$env:PORT = "$Port"
Set-Location $here
node .\server.js

