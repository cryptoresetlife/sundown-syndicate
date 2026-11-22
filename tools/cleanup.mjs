// Stops any headless Chrome a test run left behind. Only processes started by tools/browser.mjs are
// touched: they are recognised by the "sundown-chrome-" profile directory on their command line.
//   node tools/cleanup.mjs
import { execFileSync } from 'node:child_process';

const filter = "Name='chrome.exe' AND CommandLine LIKE '%sundown-chrome-%'";
const script = `$p = Get-CimInstance Win32_Process -Filter "${filter}"; $n = 0; foreach ($x in $p) { try { Stop-Process -Id $x.ProcessId -Force -ErrorAction Stop; $n++ } catch {} }; Write-Output "stopped $n"`;
try {
  if (process.platform === 'win32') console.log(execFileSync('powershell', ['-NoProfile', '-Command', script], { encoding: 'utf8' }).trim());
  else console.log(execFileSync('pkill', ['-f', 'sundown-chrome-'], { encoding: 'utf8' }).trim() || 'stopped');
} catch (err) {
  console.log('nothing to stop');
}
