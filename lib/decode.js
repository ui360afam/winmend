'use strict';
// Code anatomy: turns any hex / decimal / named Windows code into a structured
// breakdown (HRESULT, NTSTATUS, bug check, Win32, Device Manager code).
// Used by the Decoder "anatomy" panel, the log scanner and the draft generator.

const WIN32 = {
  0: ['ERROR_SUCCESS', 'The operation completed successfully.'],
  1: ['ERROR_INVALID_FUNCTION', 'Incorrect function.'],
  2: ['ERROR_FILE_NOT_FOUND', 'The system cannot find the file specified.'],
  3: ['ERROR_PATH_NOT_FOUND', 'The system cannot find the path specified.'],
  4: ['ERROR_TOO_MANY_OPEN_FILES', 'The system cannot open the file.'],
  5: ['ERROR_ACCESS_DENIED', 'Access is denied.'],
  6: ['ERROR_INVALID_HANDLE', 'The handle is invalid.'],
  8: ['ERROR_NOT_ENOUGH_MEMORY', 'Not enough memory resources are available to process this command.'],
  13: ['ERROR_INVALID_DATA', 'The data is invalid.'],
  14: ['ERROR_OUTOFMEMORY', 'Not enough memory resources are available to complete this operation.'],
  15: ['ERROR_INVALID_DRIVE', 'The system cannot find the drive specified.'],
  17: ['ERROR_NOT_SAME_DEVICE', 'The system cannot move the file to a different disk drive.'],
  19: ['ERROR_WRITE_PROTECT', 'The media is write protected.'],
  21: ['ERROR_NOT_READY', 'The device is not ready.'],
  23: ['ERROR_CRC', 'Data error (cyclic redundancy check).'],
  25: ['ERROR_SEEK', 'The drive cannot locate a specific area or track on the disk.'],
  29: ['ERROR_WRITE_FAULT', 'The system cannot write to the specified device.'],
  30: ['ERROR_READ_FAULT', 'The system cannot read from the specified device.'],
  31: ['ERROR_GEN_FAILURE', 'A device attached to the system is not functioning.'],
  32: ['ERROR_SHARING_VIOLATION', 'The process cannot access the file because it is being used by another process.'],
  33: ['ERROR_LOCK_VIOLATION', 'Another process has locked a portion of the file.'],
  38: ['ERROR_HANDLE_EOF', 'Reached the end of the file.'],
  50: ['ERROR_NOT_SUPPORTED', 'The request is not supported.'],
  53: ['ERROR_BAD_NETPATH', 'The network path was not found.'],
  64: ['ERROR_NETNAME_DELETED', 'The specified network name is no longer available.'],
  67: ['ERROR_BAD_NET_NAME', 'The network name cannot be found.'],
  80: ['ERROR_FILE_EXISTS', 'The file exists.'],
  87: ['ERROR_INVALID_PARAMETER', 'The parameter is incorrect.'],
  112: ['ERROR_DISK_FULL', 'There is not enough space on the disk.'],
  121: ['ERROR_SEM_TIMEOUT', 'The semaphore timeout period has expired.'],
  122: ['ERROR_INSUFFICIENT_BUFFER', 'The data area passed to a system call is too small.'],
  123: ['ERROR_INVALID_NAME', 'The filename, directory name, or volume label syntax is incorrect.'],
  126: ['ERROR_MOD_NOT_FOUND', 'The specified module could not be found.'],
  127: ['ERROR_PROC_NOT_FOUND', 'The specified procedure could not be found.'],
  193: ['ERROR_BAD_EXE_FORMAT', 'The file is not a valid Win32 application.'],
  203: ['ERROR_ENVVAR_NOT_FOUND', 'The system could not find the environment option that was entered.'],
  216: ['ERROR_EXE_MACHINE_TYPE_MISMATCH', 'This version of the file is not compatible with the version of Windows you are running.'],
  225: ['ERROR_VIRUS_INFECTED', 'The operation did not complete because the file contains a virus or potentially unwanted software.'],
  232: ['ERROR_NO_DATA', 'The pipe is being closed.'],
  267: ['ERROR_DIRECTORY', 'The directory name is invalid.'],
  740: ['ERROR_ELEVATION_REQUIRED', 'The requested operation requires elevation.'],
  995: ['ERROR_OPERATION_ABORTED', 'The I/O operation has been aborted.'],
  1005: ['ERROR_UNRECOGNIZED_VOLUME', 'The volume does not contain a recognized file system.'],
  1053: ['ERROR_SERVICE_REQUEST_TIMEOUT', 'The service did not respond to the start or control request in a timely fashion.'],
  1058: ['ERROR_SERVICE_DISABLED', 'The service cannot be started because it is disabled.'],
  1060: ['ERROR_SERVICE_DOES_NOT_EXIST', 'The specified service does not exist as an installed service.'],
  1062: ['ERROR_SERVICE_NOT_ACTIVE', 'The service has not been started.'],
  1064: ['ERROR_EXCEPTION_IN_SERVICE', 'An exception occurred in the service when handling the control request.'],
  1067: ['ERROR_PROCESS_ABORTED', 'The process terminated unexpectedly.'],
  1068: ['ERROR_SERVICE_DEPENDENCY_FAIL', 'The dependency service or group failed to start.'],
  1117: ['ERROR_IO_DEVICE', 'The request could not be performed because of an I/O device error.'],
  1155: ['ERROR_NO_ASSOCIATION', 'No application is associated with the specified file for this operation.'],
  1168: ['ERROR_NOT_FOUND', 'Element not found.'],
  1219: ['ERROR_SESSION_CREDENTIAL_CONFLICT', 'Multiple connections to a server or shared resource by the same user are not allowed.'],
  1223: ['ERROR_CANCELLED', 'The operation was canceled by the user.'],
  1310: ['ERROR_WRITE_PROTECT (installer)', 'Error writing to file.'],
  1314: ['ERROR_PRIVILEGE_NOT_HELD', 'A required privilege is not held by the client.'],
  1326: ['ERROR_LOGON_FAILURE', 'The user name or password is incorrect.'],
  1359: ['ERROR_INTERNAL_ERROR', 'An internal error occurred.'],
  1392: ['ERROR_FILE_CORRUPT', 'The file or directory is corrupted and unreadable.'],
  1450: ['ERROR_NO_SYSTEM_RESOURCES', 'Insufficient system resources exist to complete the requested service.'],
  1460: ['ERROR_TIMEOUT', 'This operation returned because the timeout period expired.'],
  1603: ['ERROR_INSTALL_FAILURE', 'Fatal error during installation.'],
  1618: ['ERROR_INSTALL_ALREADY_RUNNING', 'Another installation is already in progress.'],
  1619: ['ERROR_INSTALL_PACKAGE_OPEN_FAILED', 'This installation package could not be opened.'],
  1638: ['ERROR_PRODUCT_VERSION', 'Another version of this product is already installed.'],
  1641: ['ERROR_SUCCESS_REBOOT_INITIATED', 'The installer has initiated a restart.'],
  1722: ['RPC_S_SERVER_UNAVAILABLE', 'The RPC server is unavailable.'],
  3010: ['ERROR_SUCCESS_REBOOT_REQUIRED', 'The requested operation is successful. Changes take effect after a restart.'],
  14098: ['ERROR_SXS_COMPONENT_STORE_CORRUPT', 'The component store has been corrupted.'],
};

const FACILITIES = {
  0: 'General (FACILITY_NULL)', 1: 'RPC', 2: 'COM Dispatch', 3: 'Storage', 4: 'COM interface (ITF)',
  7: 'Win32', 8: 'Windows', 9: 'Security / SSPI', 10: 'Control', 11: 'Certificates', 12: 'Internet (WinINet)',
  15: 'Setup API / servicing', 16: 'Smart card', 17: 'COM+', 19: '.NET runtime', 23: 'Side-by-side (SxS)',
  25: 'HTTP', 32: 'Background Intelligent Transfer (BITS)', 36: 'Windows Update', 38: 'Graphics',
  39: 'Shell', 40: 'TPM services', 41: 'TPM software', 49: 'BitLocker (FVE)', 50: 'Windows Filtering Platform',
  52: 'NDIS (network drivers)', 57: 'Boot Configuration Data', 80: 'Microsoft Defender',
};

const BUGCHECKS = {
  0x1: 'APC_INDEX_MISMATCH', 0xA: 'IRQL_NOT_LESS_OR_EQUAL', 0x19: 'BAD_POOL_HEADER', 0x1A: 'MEMORY_MANAGEMENT',
  0x1E: 'KMODE_EXCEPTION_NOT_HANDLED', 0x20: 'KERNEL_APC_PENDING_DURING_EXIT', 0x24: 'NTFS_FILE_SYSTEM',
  0x2E: 'DATA_BUS_ERROR', 0x35: 'NO_MORE_IRP_STACK_LOCATIONS', 0x3B: 'SYSTEM_SERVICE_EXCEPTION',
  0x3D: 'INTERRUPT_EXCEPTION_NOT_HANDLED', 0x3F: 'NO_MORE_SYSTEM_PTES', 0x44: 'MULTIPLE_IRP_COMPLETE_REQUESTS',
  0x4E: 'PFN_LIST_CORRUPT', 0x50: 'PAGE_FAULT_IN_NONPAGED_AREA', 0x51: 'REGISTRY_ERROR',
  0x5C: 'HAL_INITIALIZATION_FAILED', 0x67: 'CONFIG_INITIALIZATION_FAILED', 0x69: 'IO1_INITIALIZATION_FAILED',
  0x6B: 'PROCESS1_INITIALIZATION_FAILED', 0x74: 'BAD_SYSTEM_CONFIG_INFO', 0x76: 'PROCESS_HAS_LOCKED_PAGES',
  0x77: 'KERNEL_STACK_INPAGE_ERROR', 0x7A: 'KERNEL_DATA_INPAGE_ERROR', 0x7B: 'INACCESSIBLE_BOOT_DEVICE',
  0x7E: 'SYSTEM_THREAD_EXCEPTION_NOT_HANDLED', 0x7F: 'UNEXPECTED_KERNEL_MODE_TRAP', 0x9C: 'MACHINE_CHECK_EXCEPTION',
  0x9F: 'DRIVER_POWER_STATE_FAILURE', 0xA5: 'ACPI_BIOS_ERROR', 0xBE: 'ATTEMPTED_WRITE_TO_READONLY_MEMORY',
  0xC1: 'SPECIAL_POOL_DETECTED_MEMORY_CORRUPTION', 0xC2: 'BAD_POOL_CALLER', 0xC4: 'DRIVER_VERIFIER_DETECTED_VIOLATION',
  0xC5: 'DRIVER_CORRUPTED_EXPOOL', 0xC7: 'TIMER_OR_DPC_INVALID', 0xD1: 'DRIVER_IRQL_NOT_LESS_OR_EQUAL',
  0xD5: 'DRIVER_PAGE_FAULT_IN_FREED_SPECIAL_POOL', 0xE2: 'MANUALLY_INITIATED_CRASH', 0xEA: 'THREAD_STUCK_IN_DEVICE_DRIVER',
  0xED: 'UNMOUNTABLE_BOOT_VOLUME', 0xEF: 'CRITICAL_PROCESS_DIED', 0xF4: 'CRITICAL_OBJECT_TERMINATION',
  0xFC: 'ATTEMPTED_EXECUTE_OF_NOEXECUTE_MEMORY', 0x101: 'CLOCK_WATCHDOG_TIMEOUT', 0x109: 'CRITICAL_STRUCTURE_CORRUPTION',
  0x10E: 'VIDEO_MEMORY_MANAGEMENT_INTERNAL', 0x113: 'VIDEO_DXGKRNL_FATAL_ERROR', 0x116: 'VIDEO_TDR_FAILURE',
  0x117: 'VIDEO_TDR_TIMEOUT_DETECTED', 0x119: 'VIDEO_SCHEDULER_INTERNAL_ERROR', 0x124: 'WHEA_UNCORRECTABLE_ERROR',
  0x12B: 'FAULTY_HARDWARE_CORRUPTED_PAGE', 0x133: 'DPC_WATCHDOG_VIOLATION', 0x139: 'KERNEL_SECURITY_CHECK_FAILURE',
  0x13A: 'KERNEL_MODE_HEAP_CORRUPTION', 0x144: 'BUGCODE_USB3_DRIVER', 0x154: 'UNEXPECTED_STORE_EXCEPTION',
  0x18B: 'SECURE_KERNEL_ERROR', 0x1C8: 'MANUALLY_INITIATED_POWER_BUTTON_HOLD',
};
const BUGCHECK_BY_NAME = Object.fromEntries(Object.entries(BUGCHECKS).map(([k, v]) => [v, Number(k)]));

const NTSTATUS = {
  0xC0000001: ['STATUS_UNSUCCESSFUL', 'The requested operation was unsuccessful.'],
  0xC0000005: ['STATUS_ACCESS_VIOLATION', 'The program tried to read or write memory it does not own.'],
  0xC000000E: ['STATUS_NO_SUCH_DEVICE', 'A device that does not exist was specified.'],
  0xC0000017: ['STATUS_NO_MEMORY', 'Not enough virtual memory or paging file quota is available.'],
  0xC0000022: ['STATUS_ACCESS_DENIED', 'A process requested access to an object it has no rights to.'],
  0xC0000034: ['STATUS_OBJECT_NAME_NOT_FOUND', 'The object name was not found.'],
  0xC000007B: ['STATUS_INVALID_IMAGE_FORMAT', 'The program or one of its DLLs is not built for this version of Windows (often a 32/64-bit mix).'],
  0xC0000098: ['STATUS_FILE_INVALID', 'The volume for a file has been externally altered.'],
  0xC000009A: ['STATUS_INSUFFICIENT_RESOURCES', 'Insufficient system resources exist to complete the API.'],
  0xC00000E5: ['STATUS_INTERNAL_ERROR', 'An internal error occurred.'],
  0xC0000135: ['STATUS_DLL_NOT_FOUND', 'A required DLL could not be found.'],
  0xC0000142: ['STATUS_DLL_INIT_FAILED', 'A DLL failed to initialize.'],
  0xC0000185: ['STATUS_IO_DEVICE_ERROR', 'The I/O device reported an I/O error.'],
  0xC000021A: ['STATUS_SYSTEM_PROCESS_TERMINATED', 'A critical user-mode system process ended unexpectedly.'],
  0xC0000225: ['STATUS_NOT_FOUND', 'The object was not found (at boot: a required device or boot file is missing).'],
  0xC0000409: ['STATUS_STACK_BUFFER_OVERRUN', 'The program detected an overrun of a stack-based buffer and stopped itself.'],
};

function hex8(n) { return '0x' + (n >>> 0).toString(16).toUpperCase().padStart(8, '0'); }
function shortHex(n) { return '0x' + (n >>> 0).toString(16).toUpperCase(); }

/** Normalize any code-like string so that 0x000000EF, 0xef and 0XEF compare equal. */
function normCode(s) {
  let t = String(s || '').trim().toLowerCase();
  const m = /^0x0*([0-9a-f]+)$/.exec(t);
  if (m) return '0x' + m[1];
  return t.replace(/\s+/g, ' ');
}

/** Parse a raw string into a number if it looks like a hex or decimal code. */
function parseNumber(raw) {
  const s = String(raw || '').trim();
  let m = /^(?:0x)([0-9a-f]{1,8})$/i.exec(s);
  if (m) return { value: parseInt(m[1], 16) >>> 0, form: 'hex', digits: m[1].length };
  m = /^([0-9a-f]{8})$/i.exec(s);
  if (m && /[a-f]/i.test(s)) return { value: parseInt(m[1], 16) >>> 0, form: 'hex', digits: 8 };
  m = /^(-?\d{1,10})$/.exec(s);
  if (m) {
    const n = Number(m[1]);
    if (n < 0 && n >= -2147483648) return { value: (n >>> 0), form: 'negative-decimal', digits: 8 };
    if (n >= 0 && n <= 0xFFFFFFFF) return { value: n, form: 'decimal', digits: 0 };
  }
  return null;
}

/**
 * Build the anatomy of a code. Returns null when the input is not code-like.
 */
function anatomy(raw) {
  const input = String(raw || '').trim();
  if (!input) return null;
  const upper = input.toUpperCase().replace(/\s+/g, '_');

  // Device Manager "Code 43"
  const dm = /^(?:device manager\s+)?code\s*(\d{1,2})$/i.exec(input);
  if (dm) return { input, kind: 'device-manager', title: `Device Manager Code ${dm[1]}`, value: Number(dm[1]), parts: [{ label: 'Source', value: 'Device Manager device status' }, { label: 'Code', value: dm[1] }], notes: ['Device Manager codes describe why a single device is stopped. Open the device properties to see the full status text.'] };

  // Stop code by name
  if (/^[A-Z][A-Z0-9]+(_[A-Z0-9]+)+$/.test(upper) && BUGCHECK_BY_NAME[upper] !== undefined) {
    const v = BUGCHECK_BY_NAME[upper];
    return { input, kind: 'bugcheck', title: upper, value: v, hex: hex8(v), parts: [{ label: 'Type', value: 'Bug check (blue screen stop code)' }, { label: 'Stop code', value: `${hex8(v)} (${shortHex(v)})` }, { label: 'Decimal', value: String(v) }], notes: ['Write down the "What failed" line too if the blue screen shows one: it names the driver Windows blames.'] };
  }

  const num = parseNumber(input);
  if (!num) return null;
  const v = num.value;
  const parts = [];
  const notes = [];
  const out = { input, kind: 'number', value: v, hex: hex8(v), decimal: String(v), signed: String(v | 0), parts, notes };

  if (num.form === 'negative-decimal') notes.push(`${input} is the signed decimal form of ${hex8(v)}. Tools like PowerShell and some installers print codes this way.`);

  const sevBits = v >>> 30;
  const isHresultFail = (v & 0x80000000) !== 0;

  // Small values: bug check or Win32
  if (v <= 0x1FF && (num.form === 'hex')) {
    if (BUGCHECKS[v]) {
      out.kind = 'bugcheck'; out.title = BUGCHECKS[v];
      parts.push({ label: 'Type', value: 'Bug check (blue screen stop code)' }, { label: 'Name', value: BUGCHECKS[v] }, { label: 'Stop code', value: hex8(v) }, { label: 'Decimal', value: String(v) });
      return out;
    }
  }
  if (v < 0x10000 && num.form !== 'negative-decimal') {
    if (WIN32[v]) {
      out.kind = 'win32'; out.title = WIN32[v][0]; out.message = WIN32[v][1];
      parts.push({ label: 'Type', value: 'Win32 system error code' }, { label: 'Name', value: WIN32[v][0] }, { label: 'Message', value: WIN32[v][1] }, { label: 'Decimal', value: String(v) }, { label: 'As HRESULT', value: hex8((0x80070000 | v) >>> 0) });
      if (BUGCHECKS[v] && num.form === 'hex') notes.push(`As a stop code, ${shortHex(v)} would be ${BUGCHECKS[v]}.`);
      return out;
    }
    if (BUGCHECKS[v]) {
      out.kind = 'bugcheck'; out.title = BUGCHECKS[v];
      parts.push({ label: 'Type', value: 'Bug check (blue screen stop code)' }, { label: 'Name', value: BUGCHECKS[v] }, { label: 'Stop code', value: hex8(v) });
      return out;
    }
    out.kind = 'win32';
    parts.push({ label: 'Type', value: 'Probably a Win32 system error code' }, { label: 'Decimal', value: String(v) }, { label: 'As HRESULT', value: hex8((0x80070000 | v) >>> 0) });
    notes.push('Run `certutil /error ' + v + '` or `net helpmsg ' + v + '` in a Command Prompt to print the official message text.');
    return out;
  }

  // NTSTATUS (0xC0000000 and up with facility 0) or known NTSTATUS values
  if (NTSTATUS[v] || (sevBits === 3 && ((v >>> 16) & 0xFFF) === 0)) {
    out.kind = 'ntstatus';
    const known = NTSTATUS[v];
    if (known) { out.title = known[0]; out.message = known[1]; }
    parts.push({ label: 'Type', value: 'NTSTATUS (kernel / native status code)' }, { label: 'Severity', value: ['Success', 'Informational', 'Warning', 'Error'][sevBits] });
    if (known) parts.push({ label: 'Name', value: known[0] }, { label: 'Meaning', value: known[1] });
    parts.push({ label: 'Code', value: shortHex(v & 0xFFFF) + ` (${v & 0xFFFF})` });
    notes.push('NTSTATUS values come from the Windows kernel or native APIs. When an app shows one at launch, the app or one of its components is usually the thing to repair.');
    return out;
  }

  // Activation and setup families
  if ((v >>> 12) === 0xC004F || (v >>> 16) === 0xC004) {
    out.kind = 'activation';
    parts.push({ label: 'Type', value: 'Software Licensing (activation) status' }, { label: 'Family', value: '0xC004xxxx' }, { label: 'Code', value: shortHex(v & 0xFFFF) });
    notes.push('Run `slmgr /dlv` in an elevated prompt to see the current license state.');
    return out;
  }
  if ((v >>> 20) === 0xC19) {
    out.kind = 'setup';
    parts.push({ label: 'Type', value: 'Windows Setup / feature upgrade result' }, { label: 'Family', value: '0xC19xxxxx' }, { label: 'Detail', value: shortHex(v & 0xFFFFF) });
    notes.push('Upgrade logs live in `C:\\$WINDOWS.~BT\\Sources\\Panther` (setupact.log and setuperr.log).');
    return out;
  }

  // HRESULT
  const facility = (v >>> 16) & 0x7FF;
  const code = v & 0xFFFF;
  out.kind = 'hresult';
  parts.push(
    { label: 'Type', value: 'HRESULT (32-bit result code)' },
    { label: 'Severity', value: isHresultFail ? 'Failure (top bit set)' : 'Success' },
    { label: 'Customer bit', value: (v & 0x20000000) ? 'Set (vendor-defined code)' : 'Not set (Microsoft-defined)' },
    { label: 'Facility', value: `${facility} ${FACILITIES[facility] ? '(' + FACILITIES[facility] + ')' : ''}`.trim() },
    { label: 'Code', value: `${shortHex(code)} (${code})` },
  );
  if (facility === 7) {
    const w = WIN32[code];
    if (w) {
      out.title = w[0]; out.message = w[1];
      parts.push({ label: 'Win32 name', value: w[0] }, { label: 'Message', value: w[1] });
    }
    notes.push(`Facility 7 means the code wraps a classic Win32 error: number ${code}. Many different features can raise the same Win32 error, so the context (Update, Store, an installer) decides the fix.`);
  }
  if (facility === 36) notes.push('Facility 36 belongs to the Windows Update agent. `C:\\Windows\\Logs\\WindowsUpdate` and `Get-WindowsUpdateLog` give more detail.');
  if (facility === 15) notes.push('Facility 15 shows up in servicing (DISM, optional features, cumulative updates). Check `C:\\Windows\\Logs\\CBS\\CBS.log`.');
  if (facility === 80) notes.push('Facility 80 belongs to Microsoft Defender.');
  return out;
}

module.exports = { anatomy, normCode, parseNumber, hex8, shortHex, WIN32, BUGCHECKS, BUGCHECK_BY_NAME, NTSTATUS, FACILITIES };
