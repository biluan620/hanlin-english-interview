# Pre-renders every fixed HanLin line to a small WAV clip using the English voice
# that already ships with Windows (Microsoft Zira). No installs, no network.
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Speech

$outDir = $args[0]
if (-not $outDir) { throw "usage: render-audio.ps1 <outputDir>" }
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$clips = @(
  "opening|Hi! I'm Han Lin, reporter from our school newspaper. Now I will interview you.",
  "q1|How are you different from each other?",
  "q2|What do you have in common?",
  "q3|What can you learn from your partner?",
  "great|Great!",
  "goodjob|Good job!",
  "tipprefix|Good try. A small tip:",
  "sayitlike|Say it like this.",
  "notcaught|Sorry, I didn't catch that. Please say it again.",
  "closing|Thank you! You did a wonderful interview."
)

$syn = New-Object System.Speech.Synthesis.SpeechSynthesizer
$voice = $syn.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Culture.Name -eq "en-US" } | Select-Object -First 1
if (-not $voice) { throw "no en-US voice found" }
$syn.SelectVoice($voice.VoiceInfo.Name)
Write-Output ("voice: " + $voice.VoiceInfo.Name)

$fmt = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(
  16000,
  [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen,
  [System.Speech.AudioFormat.AudioChannel]::Mono)

$manifest = @()
foreach ($c in $clips) {
  $parts = $c -split '\|', 2
  $id = $parts[0]; $text = $parts[1]
  $file = Join-Path $outDir "$id.wav"
  $syn.SetOutputToWaveFile($file, $fmt)
  $ssml = '<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US"><prosody pitch="+18%" rate="0.98">' + $text + '</prosody></speak>'
  try { $syn.SpeakSsml($ssml) } catch { $syn.Speak($text) }
  $syn.SetOutputToNull()
  $bytes = (Get-Item $file).Length
  $secs = [math]::Round(($bytes - 44) / 32000.0, 2)
  $manifest += ("{0}`t{1}`t{2}" -f $id, $secs, $text)
}
$syn.Dispose()
$manifest -join "`n" | Set-Content -Path (Join-Path $outDir "manifest.tsv") -Encoding utf8
Write-Output "clips done"
