'use strict';
// Draft generator: given a bare code (and optional hints), produce a complete
// knowledge-base entry in the same shape as the built-in ones. The output is
// a solid, safe starting point (real commands, safest steps first) that an
// editor reviews in the admin panel before publishing.

const { anatomy, WIN32, BUGCHECKS, BUGCHECK_BY_NAME, hex8, shortHex } = require('./decode');

const F = (title, detail, difficulty, timeEstimate, riskNote) => ({ title, detail, difficulty, timeEstimate, ...(riskNote ? { riskNote } : {}) });

const COMMON = {
  restart: F('Restart once and note what you see', 'Do a full restart (Start > Power > Restart, not Shut down, because Fast Startup keeps parts of the old session). If the error returns, write down the exact code, the time and what you were doing. Those three details make every later step faster.', 'easy', '2-5 min'),
  updates: F('Install pending Windows and driver updates', 'Open Settings > Windows Update, install everything offered (including optional driver updates), then restart. Many known faults are fixed by a cumulative update or a newer vendor driver.', 'easy', '10-30 min'),
  sfcdism: F('Repair system files with DISM and SFC', 'Open Terminal (Admin) and run `DISM /Online /Cleanup-Image /RestoreHealth` first, then `sfc /scannow`. Let both finish without interrupting, then restart.', 'intermediate', '15-40 min'),
  eventviewer: F('Look up the event in Event Viewer', 'Press Win + R, type `eventvwr.msc`, then open Windows Logs > System (or Application). Filter by the time of the failure and read the Error entries around it: the Source and Event ID usually name the component involved.', 'easy', '5-10 min'),
  chkdsk: F('Check the disk for file system errors', 'In an elevated prompt run `chkdsk C: /scan`. If it reports problems, schedule a repair with `chkdsk C: /f` and restart so it can run before Windows loads.', 'intermediate', '10-60 min', 'A full repair pass on a large or failing drive can take a long time. Back up important files first and do not power off while it runs.'),
  mdsched: F('Test the memory', 'Run `mdsched.exe` and choose "Restart now and check for problems". Any reported error means a RAM stick (or its settings) needs attention. For a deeper test, run MemTest86 from a USB stick for several passes.', 'intermediate', '20-60 min', 'The test runs outside Windows, so plan for the PC to be unavailable while it works.'),
  rollback: F('Undo the most recent change', 'If the problem started after an update, driver or new program, reverse it: Settings > Windows Update > Update history > Uninstall updates, Device Manager > Roll Back Driver, or Settings > Apps to remove the program. System Restore (`rstrui.exe`) can roll back several changes at once.', 'easy', '10-20 min'),
  defender: F('Scan for malware', 'Open Windows Security > Virus & threat protection > Scan options and run a Full scan. If something keeps coming back, run Microsoft Defender Offline scan from the same page.', 'easy', '20-60 min'),
  cleanboot: F('Try a clean boot to rule out background software', 'Run `msconfig`, on the Services tab tick "Hide all Microsoft services" and click "Disable all", then disable startup apps in Task Manager and restart. If the error disappears, re-enable items in small groups to find the one responsible.', 'intermediate', '20-40 min'),
  repairinstall: F('Run an in-place repair install as a last resort', 'Download the Windows installation media from Microsoft, run setup.exe from inside Windows and choose to keep personal files and apps. It replaces every system file without wiping your data.', 'advanced', '60-120 min', 'Back up your important files before starting, and keep the PC plugged in until setup completes.'),
};

const TEMPLATES = {
  bsod: {
    severity: 'high', signals: ['symptom:bsod', 'when:random', 'change:driver-update', 'boot:yes'], tags: ['bsod', 'stop-code'],
    meaning: (n) => `${n} is a bug check: the Windows kernel found a condition it could not recover from safely and stopped the whole system on purpose to protect your data. The stop code describes the kind of fault, not the culprit, so the job is to work out which driver, setting or piece of hardware produced it. A blue screen that repeats with the same code points to one cause; a different code every time points toward RAM, power or overheating.`,
    causes: ['A faulty, outdated or freshly updated kernel-mode driver', 'Unstable RAM, or memory settings such as XMP/EXPO that are too aggressive', 'Corrupted system files after an interrupted update or power loss', 'Overheating or an unstable overclock or undervolt', 'A failing storage drive or a loose cable'],
    fixes: () => [COMMON.restart, F('Read the crash details', 'Open Reliability Monitor (search "reliability history") or Event Viewer > Windows Logs > System and find the BugCheck event (Event ID 1001). If the blue screen showed a "What failed" file, search that file name to identify the driver behind it.', 'easy', '5-10 min'), COMMON.updates, COMMON.rollback, COMMON.sfcdism, COMMON.mdsched, COMMON.chkdsk],
    prevention: ['Install drivers from the hardware maker or Windows Update, not from driver-updater tools', 'Keep CPU, GPU and RAM at stock settings until the system has proven stable', 'Keep an eye on temperatures and clean dust from fans and filters', 'Leave automatic memory dumps enabled so the next crash leaves evidence'],
  },
  update: {
    severity: 'medium', signals: ['symptom:update-fail', 'when:during-update', 'change:windows-update', 'boot:yes'], tags: ['windows-update', 'update'],
    meaning: (n, m) => `${n} is a result code returned while Windows Update was downloading, preparing or installing an update.${m ? ' Its underlying message is: "' + m + '".' : ''} The update itself is rarely broken; the usual problem is on the PC: a corrupted download cache, stopped update services, too little free space, damaged system components or something blocking the connection to Microsoft's servers.`,
    causes: ['A corrupted or half-finished download in the SoftwareDistribution cache', 'Windows Update, BITS or Cryptographic services stopped or disabled', 'Too little free space on the system drive', 'Corrupted component store or system files', 'A VPN, proxy, firewall or third-party antivirus interfering with the download'],
    fixes: () => [F('Run the Windows Update troubleshooter', 'Open Settings > System > Troubleshoot > Other troubleshooters and click Run next to Windows Update. On Windows 10 it is under Settings > Update & Security > Troubleshoot. Restart and try again.', 'easy', '5-10 min'), F('Free up disk space', 'Make sure the system drive has at least 20 GB free. Settings > System > Storage > Temporary files lets you remove old update files and other clutter safely.', 'easy', '5-15 min'), F('Reset the update download cache', 'Open Terminal (Admin) and run `net stop wuauserv`, `net stop bits` and `net stop cryptsvc`. Rename the cache with `ren C:\\Windows\\SoftwareDistribution SoftwareDistribution.old`, then start the services again with `net start cryptsvc`, `net start bits` and `net start wuauserv`.', 'intermediate', '10-15 min', 'Renaming the folder clears your local update history view. Installed updates are not affected.'), COMMON.sfcdism, F('Install the update manually', 'Note the KB number shown in Settings > Windows Update, search for it in the Microsoft Update Catalog (catalog.update.microsoft.com), download the package for your Windows version and architecture, and run it.', 'intermediate', '10-20 min'), COMMON.repairinstall],
    prevention: ['Keep at least 20 GB free on the system drive', 'Do not shut down while "Working on updates" is on screen', 'Pause VPNs and third-party firewalls while large updates download', 'Run `DISM /Online /Cleanup-Image /ScanHealth` now and then to catch component damage early'],
  },
  win32: {
    severity: 'medium', signals: ['symptom:app-crash', 'when:install', 'change:new-software', 'boot:yes'], tags: ['win32', 'system-error'],
    meaning: (n, m) => `${n} is a Windows system error code${m ? ' with the official message "' + m + '"' : ''}. Programs, installers and Windows features pass these codes up when a lower-level operation fails, so the same number can appear in very different places. The surrounding context (which app, which file, which action) tells you what actually failed.`,
    causes: ['A missing, locked or damaged file that the program needs', 'Insufficient permissions for the folder, registry key or service involved', 'Security software blocking the operation', 'Corrupted system files or a broken program install', 'A setting changed by a recent update or another program'],
    fixes: () => [COMMON.restart, F('Run the action again as administrator', 'Right-click the program or installer and choose "Run as administrator". If that works, the failure was a permissions problem rather than a broken file.', 'easy', '2-5 min'), COMMON.eventviewer, F('Repair or reinstall the program', 'Open Settings > Apps > Installed apps, find the program, open its menu and choose Modify, Repair or Advanced options > Repair if offered. Otherwise uninstall it, restart and install the latest version from the vendor.', 'easy', '10-20 min'), COMMON.sfcdism, COMMON.cleanboot],
    prevention: ['Install software from the vendor rather than bundles or mirrors', 'Keep Windows and your apps updated', 'Avoid "registry cleaner" and "PC optimizer" tools', 'Create a restore point before large installs'],
  },
  store: {
    severity: 'low', signals: ['symptom:store-fail', 'when:install', 'change:windows-update', 'boot:yes'], tags: ['microsoft-store', 'apps'],
    meaning: (n) => `${n} comes from the Microsoft Store or the app installer service. It means the Store could not download, license or install an app package. The cause is usually local: a stale Store cache, the wrong date and time, a sign-in problem or a stopped service.`,
    causes: ['A corrupted Microsoft Store cache', 'Incorrect date, time or region settings', 'A problem with the Microsoft account sign-in or license', 'Store-related services stopped or disabled', 'A proxy or VPN blocking Store traffic'],
    fixes: () => [F('Reset the Store cache', 'Press Win + R, type `wsreset.exe` and press Enter. A blank window opens for a few seconds and the Store relaunches with a fresh cache.', 'easy', '2-5 min'), F('Check date, time and region', 'Open Settings > Time & language and turn on "Set time automatically" and "Set time zone automatically", then click Sync now. Make sure Region matches where you are.', 'easy', '2-5 min'), F('Sign out of the Store and back in', 'Open the Store, click your profile picture, sign out, restart the PC and sign in again with the same Microsoft account.', 'easy', '5 min'), F('Run the Windows Store Apps troubleshooter', 'Settings > System > Troubleshoot > Other troubleshooters > Windows Store Apps > Run.', 'easy', '5-10 min'), F('Repair or reset the Store app', 'Settings > Apps > Installed apps > Microsoft Store > Advanced options. Try Repair first, then Reset if the problem remains.', 'easy', '5 min'), COMMON.sfcdism],
    prevention: ['Keep the clock synced automatically', 'Install Windows updates, since they include Store framework fixes', 'Avoid blocking Microsoft endpoints in firewall or hosts files'],
  },
  activation: {
    severity: 'medium', signals: ['symptom:activation-fail', 'when:startup', 'change:new-hardware', 'boot:yes'], tags: ['activation', 'license'],
    meaning: (n) => `${n} is an activation result. Windows could not confirm that this PC has a valid license, either because the key does not match the installed edition, the license is tied to different hardware, or the activation servers could not be reached.`,
    causes: ['A product key for a different edition (Home vs Pro)', 'A major hardware change, especially a new motherboard', 'A volume license or KMS key on a home PC', 'No internet connection or a blocked connection to the activation servers', 'The key was already used on more PCs than its license allows'],
    fixes: () => [F('Check the current license state', 'Open Settings > System > Activation to read the status message. For detail, run `slmgr /dlv` in an elevated prompt: it shows the edition, the license channel and the partial key.', 'easy', '2-5 min'), F('Run the Activation troubleshooter', 'On the Activation page click Troubleshoot. If you recently changed hardware and your license is linked to your Microsoft account, choose "I changed hardware on this device recently".', 'easy', '5-10 min'), F('Enter the correct product key', 'Settings > System > Activation > Change product key. Use the key that matches the installed edition. Keys from a different edition will not activate.', 'easy', '5 min'), F('Retry online activation from the command line', 'Run `slmgr /ato` in an elevated prompt while connected to the internet. Disable VPNs or proxies first.', 'intermediate', '5 min')],
    prevention: ['Link your digital license to your Microsoft account', 'Buy keys from Microsoft or authorized sellers', 'Keep a record of the product key and where it came from'],
  },
  network: {
    severity: 'medium', signals: ['symptom:no-network', 'when:random', 'change:windows-update', 'boot:yes'], tags: ['network', 'connectivity'],
    meaning: (n) => `${n} is a networking error: Windows or an app could not reach a network resource. The fault can sit anywhere along the path, from the adapter driver and its settings, through DNS and the router, to the remote service itself.`,
    causes: ['An outdated or misbehaving network adapter driver', 'Corrupted TCP/IP or Winsock settings', 'DNS problems or a stale DNS cache', 'VPN, proxy or firewall software intercepting traffic', 'A router or ISP problem'],
    fixes: () => [F('Restart the router and the PC', 'Unplug the router (and modem) for 30 seconds, plug it back in, wait until it is fully online, then restart the PC.', 'easy', '5 min'), F('Run the Network troubleshooter', 'Settings > System > Troubleshoot > Other troubleshooters > Network and Internet > Run.', 'easy', '5 min'), F('Flush DNS and renew the address', 'In an elevated prompt run `ipconfig /flushdns`, then `ipconfig /release` and `ipconfig /renew`.', 'easy', '2-5 min'), F('Reset Winsock and TCP/IP', 'Run `netsh winsock reset` and `netsh int ip reset` in an elevated prompt, then restart.', 'intermediate', '5 min'), F('Update or reinstall the network driver', 'Device Manager > Network adapters > your adapter > Update driver, or download the latest driver from the PC or adapter maker. Uninstalling the device and restarting makes Windows reinstall it cleanly.', 'intermediate', '10-15 min'), F('Use Network reset', 'Settings > Network & internet > Advanced network settings > Network reset. It reinstalls every adapter and returns network settings to defaults.', 'intermediate', '10 min', 'Saved Wi-Fi passwords and VPN adapters are removed, so have them ready.')],
    prevention: ['Keep network drivers current from the hardware maker', 'Remove VPN clients you no longer use', 'Restart the router occasionally and keep its firmware updated'],
  },
  startup: {
    severity: 'critical', signals: ['symptom:no-boot', 'when:startup', 'change:windows-update', 'boot:recovery'], tags: ['boot', 'startup', 'recovery'],
    meaning: (n) => `${n} appears while Windows is starting. Something in the boot chain (firmware settings, the boot configuration data, the system drive or an early-loading driver) is missing or damaged, so Windows cannot finish loading.`,
    causes: ['Damaged boot configuration data (BCD) or boot files', 'A changed storage mode (AHCI/RAID) or boot order in UEFI/BIOS', 'A failed update or driver installed just before the restart', 'A failing or disconnected system drive', 'Power loss during an update'],
    fixes: () => [F('Disconnect extra drives and devices', 'Unplug USB drives, card readers, docks and other non-essential devices, then restart. A wrong boot device order is a common and harmless cause.', 'easy', '5 min'), F('Run Startup Repair', 'Interrupt startup three times in a row or boot from Windows installation media, then choose Troubleshoot > Advanced options > Startup Repair.', 'easy', '10-30 min'), F('Uninstall the latest update from recovery', 'In Advanced options choose Uninstall Updates, then remove the latest quality update first. Try the feature update only if that does not help.', 'intermediate', '10-20 min'), F('Check the disk from the recovery prompt', 'In Advanced options > Command Prompt, run `chkdsk C: /f` (use `bcdedit` or `diskpart` > `list volume` to confirm the Windows drive letter first).', 'intermediate', '15-60 min'), F('Rebuild the boot configuration', 'From the recovery Command Prompt run `bootrec /scanos` and `bootrec /rebuildbcd`. On UEFI systems, `bcdboot C:\\Windows` recreates the boot files.', 'advanced', '15-30 min', 'Editing boot records can make things worse if the wrong drive is targeted. Back up data first if you can reach it from another PC.')],
    prevention: ['Never power off while Windows shows update progress', 'Do not change SATA or RAID mode in firmware after Windows is installed', 'Keep a Windows recovery USB drive ready', 'Back up regularly to an external or cloud location'],
  },
  driver: {
    severity: 'medium', signals: ['symptom:device-error', 'when:startup', 'change:driver-update', 'boot:yes'], tags: ['driver', 'device-manager'],
    meaning: (n) => `${n} is a device or driver problem reported by Device Manager or the driver framework. Windows found the device but could not start it, load its driver, or keep it running, so the hardware is unavailable until the driver situation is fixed.`,
    causes: ['A missing, corrupted or incompatible driver', 'A driver update that introduced a bug', 'A device that is disconnected, underpowered or failing', 'Conflicting leftover drivers from older hardware', 'Firmware or BIOS that needs an update'],
    fixes: () => [F('Read the full device status', 'Open Device Manager (`devmgmt.msc`), double-click the device with the warning icon and read "Device status" on the General tab. Note the code number shown there.', 'easy', '2 min'), F('Reconnect or power-cycle the device', 'Unplug USB devices and plug them into a different port (preferably directly on the PC). For internal hardware, shut down fully and hold the power button for 30 seconds before starting again.', 'easy', '5 min'), F('Roll back or update the driver', 'In the device properties open the Driver tab. Use Roll Back Driver if the problem started after an update, otherwise install the newest driver from the device or PC maker.', 'easy', '10-15 min'), F('Uninstall the device and let Windows reinstall it', 'Right-click the device > Uninstall device (tick "Attempt to remove the driver" if offered), then restart. Windows detects the device again and installs a fresh driver.', 'intermediate', '10 min'), COMMON.updates],
    prevention: ['Get drivers from the hardware maker or Windows Update', 'Create a restore point before installing new drivers', 'Avoid unpowered USB hubs for demanding devices'],
  },
  hardware: {
    severity: 'high', signals: ['symptom:freeze', 'when:under-load', 'change:new-hardware', 'boot:yes'], tags: ['hardware'],
    meaning: (n) => `${n} points at the physical side of the PC: memory, storage, the processor, graphics or power delivery reported a fault that software could not hide. Hardware errors often start rare and become more frequent, so it is worth testing now rather than waiting.`,
    causes: ['Failing or incompatible RAM', 'A storage drive with bad sectors or a failing controller', 'Overheating from dust, dried thermal paste or blocked airflow', 'An unstable overclock, undervolt or XMP/EXPO profile', 'A weak or aging power supply'],
    fixes: () => [F('Back up your important files now', 'Before testing, copy your important files to an external drive or cloud storage. If hardware is failing, every extra hour of use is a risk.', 'easy', '10-60 min'), F('Return to stock settings', 'Disable overclocking and XMP/EXPO memory profiles in UEFI/BIOS (or load optimized defaults), then test whether the problem continues.', 'intermediate', '10 min'), COMMON.mdsched, F('Check the drive health', 'In Terminal (Admin) run `wmic diskdrive get model,status` or, in PowerShell, `Get-PhysicalDisk | Get-StorageReliabilityCounter`. The drive maker\'s tool gives the full SMART report.', 'intermediate', '10 min'), F('Check temperatures and cooling', 'Watch CPU and GPU temperatures under load with a monitoring tool. Clean dust out of fans and heatsinks, and make sure vents are not blocked.', 'intermediate', '20-40 min')],
    prevention: ['Keep the PC clean and well ventilated', 'Use a quality power supply with headroom for your parts', 'Back up regularly to more than one place'],
  },
  performance: {
    severity: 'low', signals: ['symptom:slow', 'when:startup', 'change:new-software', 'boot:yes'], tags: ['performance'],
    meaning: (n) => `${n} is a performance problem rather than a crash: something is using more CPU, disk, memory or time than it should. Finding the process responsible is usually the whole battle.`,
    causes: ['Too many apps launching at startup', 'A background update, indexing or antivirus scan', 'Malware or unwanted software', 'A nearly full or failing drive', 'Outdated drivers'],
    fixes: () => [F('Find the process using the resources', 'Open Task Manager (Ctrl + Shift + Esc), go to Processes and sort by CPU, Memory or Disk. Note the top process before changing anything.', 'easy', '5 min'), F('Trim startup apps', 'Task Manager > Startup apps: disable anything you do not need at sign-in.', 'easy', '5 min'), COMMON.defender, COMMON.updates, COMMON.sfcdism],
    prevention: ['Keep 15-20% of the system drive free', 'Uninstall software you no longer use', 'Avoid running multiple antivirus products'],
  },
  'file-system': {
    severity: 'medium', signals: ['symptom:file-corrupt', 'when:random', 'change:power-event', 'boot:yes'], tags: ['files', 'disk', 'ntfs'],
    meaning: (n) => `${n} relates to files, folders or the file system. Windows could not read, write, move or trust some data on disk, either because of permissions, a lock held by another process, or damage to the file system itself.`,
    causes: ['File system damage after a power cut or forced shutdown', 'Bad sectors on a failing drive', 'Permissions or ownership that block access', 'Another process holding the file open', 'Security software quarantining or locking the file'],
    fixes: () => [COMMON.restart, F('Check permissions and ownership', 'Right-click the file or folder > Properties > Security. Confirm your account has the access it needs. Only take ownership of your own data folders, never system folders.', 'intermediate', '5-10 min'), COMMON.chkdsk, COMMON.sfcdism, F('Restore from a backup or previous version', 'Right-click the folder > Properties > Previous Versions (if File History or restore points exist), or restore the file from your backup.', 'easy', '5-15 min')],
    prevention: ['Use safely remove for external drives', 'Keep backups with File History or OneDrive', 'Watch drive health and replace drives that report errors'],
  },
  audio: {
    severity: 'low', signals: ['symptom:no-audio', 'when:startup', 'change:windows-update', 'boot:yes'], tags: ['audio', 'sound'],
    meaning: (n) => `${n} is an audio problem: Windows cannot use an output or input device correctly. Most cases come down to the wrong default device, a stopped audio service or a driver that an update replaced.`,
    causes: ['The wrong default playback or recording device', 'A stopped Windows Audio service', 'A generic or mismatched audio driver installed by an update', 'Audio enhancements or exclusive mode conflicts', 'A disconnected or muted device'],
    fixes: () => [F('Check the output device and volume', 'Click the speaker icon on the taskbar, open the device list and pick the right output. Check that the app is not muted in Settings > System > Sound > Volume mixer.', 'easy', '2 min'), F('Run the audio troubleshooter', 'Settings > System > Troubleshoot > Other troubleshooters > Audio > Run.', 'easy', '5 min'), F('Restart the audio services', 'Run `services.msc` and restart "Windows Audio" and "Windows Audio Endpoint Builder". Make sure both are set to Automatic.', 'easy', '5 min'), F('Reinstall or roll back the audio driver', 'Device Manager > Sound, video and game controllers > your device > Driver tab. Roll back if the problem began after an update, or install the driver from your PC maker.', 'intermediate', '10-15 min')],
    prevention: ['Use the audio driver from your PC or motherboard maker', 'Create a restore point before driver updates'],
  },
  security: {
    severity: 'medium', signals: ['symptom:permission-denied', 'when:install', 'change:new-software', 'boot:yes'], tags: ['security', 'permissions'],
    meaning: (n) => `${n} is a security or permissions result: Windows, Microsoft Defender or a policy refused an action. Sometimes that is exactly the right outcome (a blocked threat); other times a setting, a leftover security product or damaged permissions is blocking something legitimate.`,
    causes: ['Insufficient permissions for the account or process', 'A third-party security product, or its leftovers after removal', 'Group Policy or registry settings restricting the feature', 'Corrupted Defender or Windows Security components', 'Malware tampering with security settings'],
    fixes: () => [F('Retry with administrator rights', 'Run the program or command as administrator. In a work or school PC, ask your IT team, since policies may block the action deliberately.', 'easy', '2 min'), F('Check Windows Security status', 'Open Windows Security and review Virus & threat protection and Protection history. Restore or allow items only if you are sure they are safe.', 'easy', '5 min'), F('Remove leftover security software', 'Uninstall any old antivirus from Settings > Apps, then use the vendor\'s removal tool to clear leftovers.', 'intermediate', '15 min'), COMMON.defender, COMMON.sfcdism],
    prevention: ['Run one antivirus product at a time', 'Use a standard account for daily work', 'Keep Windows Security definitions up to date'],
  },
};

const CATEGORY_HINTS = [
  [/update|wuauserv|softwaredistribution|kb\d{6,}/i, 'update'],
  [/store|wsreset|appx|msix/i, 'store'],
  [/activat|license|product key|slmgr/i, 'activation'],
  [/wi-?fi|wireless|ethernet|dns|network|internet|vpn|dhcp|tcp/i, 'network'],
  [/boot|startup|bcd|winload|recovery/i, 'startup'],
  [/driver|device manager|\bcode \d/i, 'driver'],
  [/sound|audio|speaker|microphone|realtek/i, 'audio'],
  [/defender|smartscreen|security|firewall|permission|access denied/i, 'security'],
  [/disk|ntfs|file|folder|corrupt/i, 'file-system'],
  [/slow|cpu|memory usage|lag|freez|hang/i, 'performance'],
  [/gpu|ram|overheat|ssd|hdd|hardware|whea/i, 'hardware'],
];

function slugify(s) {
  return String(s || '').toLowerCase().replace(/^0x/, '0x').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'error-' + Date.now();
}

function inferCategory(a, hints) {
  if (a) {
    if (a.kind === 'bugcheck') return 'bsod';
    if (a.kind === 'device-manager') return 'driver';
    if (a.kind === 'activation') return 'activation';
    if (a.kind === 'setup') return 'update';
    if (a.kind === 'hresult') {
      const fac = (a.value >>> 16) & 0x7FF;
      if (fac === 36 || fac === 15 || fac === 32) return 'update';
      if (fac === 80 || fac === 9) return 'security';
      if ((a.value >>> 16) === 0x803F || (a.value >>> 16) === 0x8086 || (a.value >>> 16) === 0x87AF) return 'store';
      if (fac === 49) return 'security';
    }
  }
  for (const [re, cat] of CATEGORY_HINTS) if (re.test(hints)) return cat;
  return 'win32';
}

/**
 * Build a draft entry.
 * @param {object} input { code, title?, category?, severity?, description?, aliases?[], windowsVersions?[] }
 */
function draftEntry(input) {
  const code = String(input.code || input.title || '').trim();
  if (!code) throw new Error('A code or title is required');
  let a = anatomy(code);
  if ((!a || !a.hex) && /^[A-Z][A-Z0-9]*(_[A-Z0-9]+)+$/.test(code)) {
    const hexAlias = (input.aliases || []).find((x) => /^0x[0-9a-f]{1,8}$/i.test(String(x)));
    if (hexAlias) { const h = anatomy(hexAlias); if (h) a = { ...h, kind: input.category === 'bsod' || h.kind === 'bugcheck' || h.kind === 'win32' ? 'bugcheck' : h.kind, title: code }; }
  }
  const hints = [code, input.title, input.description, input.context].filter(Boolean).join(' ');
  const category = TEMPLATES[input.category] ? input.category : inferCategory(a, hints);
  const T = TEMPLATES[category];

  let official = a && a.title ? a.title : null;
  let message = input.description || (a && a.message) || null;
  const isName = /^[A-Z][A-Z0-9]*(_[A-Z0-9]+)+$/.test(code);
  const codes = new Set([code]);
  if (a && a.hex) { codes.add(a.hex); if (a.kind === 'bugcheck') codes.add(shortHex(a.value)); }
  if (a && a.kind === 'bugcheck' && official) codes.add(official);
  if (a && a.kind === 'hresult' && a.value & 0x80000000) codes.add(String(a.value | 0));
  for (const x of input.aliases || []) if (x) codes.add(String(x).trim());

  const displayCode = a && a.hex && !isName && a.kind !== 'device-manager' ? (a.kind === 'bugcheck' ? a.hex : code.startsWith('0x') ? code : a.hex) : code;
  let title = input.title && String(input.title).trim();
  if (!title) {
    if (a && a.kind === 'bugcheck') title = official;
    else if (a && a.kind === 'device-manager') title = a.title;
    else if (official && official !== displayCode) title = `${displayCode} (${official})`;
    else title = `Error ${displayCode}`;
  }
  const named = official && official !== title ? `${title}` : title;

  const summaryBits = {
    bsod: `Windows stopped with the blue screen stop code ${official || code}${a && a.hex ? ' (' + a.hex + ')' : ''}. It is usually caused by a driver, memory or system file problem, and the steps below start with the safest checks.`,
    update: `Windows Update reported ${displayCode}${message ? ' ("' + message.replace(/\.$/, '') + '")' : ''} and the update could not finish. Clearing the update cache and repairing system components fixes most cases.`,
    store: `The Microsoft Store returned ${displayCode} and could not finish downloading or installing an app. A cache reset, a clock check and a fresh sign-in solve most cases.`,
    activation: `Windows activation failed with ${displayCode}. The license, the product key and the edition need to line up, and the steps below check each one.`,
    network: `${displayCode} means Windows or an app could not complete a network operation. Work from the router to the adapter driver to find where the connection breaks.`,
    startup: `${displayCode} appears during startup and prevents Windows from loading normally. The recovery environment has the tools to repair it.`,
    driver: `${a && a.kind === 'device-manager' ? a.title : displayCode} means Windows could not start or use a device properly. Reconnecting the device and repairing its driver fixes most cases.`,
    hardware: `${displayCode} points at a hardware fault. Back up first, then test memory, storage and temperatures in that order.`,
    performance: `${displayCode} slows the PC down. Find the process responsible in Task Manager, then work through the fixes below.`,
    'file-system': `${displayCode} means Windows could not read, write or access a file or folder${message ? ' ("' + message.replace(/\.$/, '') + '")' : ''}. Permissions, file locks and disk errors are the usual suspects.`,
    audio: `${displayCode} is an audio fault that leaves you with no sound or a missing device. Check the default device, the audio services and the driver in that order.`,
    security: `${displayCode} means Windows or Microsoft Defender blocked an action${message ? ' ("' + message.replace(/\.$/, '') + '")' : ''}. The steps below separate a deliberate block from a broken setting.`,
    win32: `${displayCode}${official && official !== displayCode ? ' (' + official + ')' : ''} is a Windows system error${message ? ': "' + message.replace(/\.$/, '') + '"' : ''}. The program or feature that showed it tells you where to start, and the fixes below cover the common causes.`,
  };

  if (message) message = String(message).trim().replace(/\.+$/, '');
  let meaning = T.meaning(named, message);
  if (a && a.kind === 'hresult' && ((a.value >>> 16) & 0x7FF) === 7 && WIN32[a.value & 0xFFFF]) {
    meaning += ` Technically, ${a.hex} is an HRESULT that wraps Win32 error ${a.value & 0xFFFF} (${WIN32[a.value & 0xFFFF][0]}).`;
  }

  const entry = {
    slug: slugify(input.slug || (a && a.kind === 'bugcheck' ? official : displayCode)),
    title,
    codes: [...codes],
    category,
    severity: ['low', 'medium', 'high', 'critical'].includes(input.severity) ? input.severity : T.severity,
    frequency: input.frequency || 'common',
    windowsVersions: input.windowsVersions && input.windowsVersions.length ? input.windowsVersions : ['Windows 10', 'Windows 11'],
    summary: input.summary || summaryBits[category],
    meaning: input.meaning || meaning,
    commonCauses: input.commonCauses && input.commonCauses.length ? input.commonCauses : [...T.causes],
    fixes: input.fixes && input.fixes.length ? input.fixes : T.fixes(),
    prevention: input.prevention && input.prevention.length ? input.prevention : [...T.prevention],
    signals: input.signals && input.signals.length ? input.signals : [...T.signals],
    relatedSlugs: input.relatedSlugs || [],
    tags: [...new Set([...(input.tags || []), ...T.tags, ...(a && a.hex ? [a.hex.toLowerCase()] : [])])],
    autoDrafted: true,
  };
  return entry;
}

module.exports = { draftEntry, slugify, TEMPLATES, inferCategory };
