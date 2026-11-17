param([string]$File, [int]$Start, [int]$End)
$lines = Get-Content -LiteralPath $File
$i = $Start - 1
while ($i -lt $End -and $i -lt $lines.Count) {
  Write-Output ("{0,4}: {1}" -f ($i + 1), $lines[$i])
  $i++
}
