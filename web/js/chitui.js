const socket = io();
var websockets = []
var printers = {}
var currentPrinter = null
var progress = null
const COMMAND_TIMEOUT_MS = 10000
const pendingCommands = {}
let commandToast = null
let uploadToast = null

socket.on("connect", () => {
  console.log('socket.io connected: ' + socket.id);
  setServerStatus(true)
});

socket.on("disconnect", () => {
  console.log("socket.io disconnected"); // undefined
  setServerStatus(false)
});

socket.on("printers", (data) => {
  console.log(JSON.stringify(data))
  printers = data
  $("#printersList").empty()
  addPrinters(data)
});

socket.on("printer_response", (data) => {
  switch (data.Data.Cmd) {
    case SDCP_CMD_STATUS:
    case SDCP_CMD_ATTRIBUTES:
      break
    case SDCP_CMD_RETRIEVE_FILE_LIST:
      handle_printer_files(data)
      break
    case SDCP_CMD_BATCH_DELETE_FILES:
      modalConfirm.hide()
      break
    case SDCP_CMD_START_PRINTING:
      modalConfirm.hide()
      break
    default:
      console.log(data)
      break
  }
});

socket.on("printer_error", (data) => {
  console.log("=== ERROR ===")
  console.log(data)
  alert("Error Code:" + data.Data.Data.ErrorCode)
});

socket.on("printer_notice", (data) => {
  console.log("=== NOTICE ===")
  console.log(data)
  alert("Notice:" + data.Data.Data.Message)
});

socket.on("printer_status", (data) => {
  handle_printer_status(data)
});

socket.on("printer_attributes", (data) => {
  handle_printer_attributes(data)
});

socket.on("firmware_command_sent", (data) => {
  startCommandTimeout(data)
})

socket.on("gcode_command_sent", (data) => {
  startCommandTimeout(data)
})

socket.on("printer_response", (data) => {
  if (data.CommandId) {
    resolveCommandTimeout(data.CommandId, `Command ${data.CommandId} finished for printer ${data.Data?.MainboardID || '?'}.`)
  }
})

socket.on("printer_error", (data) => {
  if (data.CommandId) {
    resolveCommandTimeout(data.CommandId, `Command ${data.CommandId} failed for printer ${data.Data?.MainboardID || '?'}.`, 'danger')
  }
})

socket.on("firmware_error", (data) => {
  handleCommandErrorToast(data)
})

socket.on("gcode_error", (data) => {
  handleCommandErrorToast(data)
})


function handle_printer_status(data) {
  //console.log(JSON.stringify(data))
  if (!printers[data.MainboardID].hasOwnProperty('status')) {
    printers[data.MainboardID]['status'] = {}
  }
  var filter = ['CurrentStatus', 'PrintScreen', 'ReleaseFilm', 'TempOfUVLED', 'TimeLapseStatus', 'PrintInfo']
  $.each(data.Status, function (key, val) {
    if (filter.includes(key)) {
      if (val.length == 1) {
        val = val[0]
      }
      printers[data.MainboardID]['status'][key] = val
    }
  })
  printer_status = printers[data.MainboardID]['status']
  // update file list on status change from UNKNOWN_8 to Idle
  if (typeof printer_status['PreviousStatus'] !== undefined
    && printer_status['PreviousStatus'] == SDCP_MACHINE_STATUS_UNKNOWN_8
    && printer_status['CurrentStatus'] == SDCP_MACHINE_STATUS_IDLE) {
    socket.emit("printer_files", { id: data.MainboardID, url: '/local' })
  }
  printers[data.MainboardID]['status']['PreviousStatus'] = printer_status['CurrentStatus']
  updatePrinterStatus(data)
  createTable('Status', data.Status)
  if (data.Status.CurrentStatus.includes(1)) {
    createTable('Print', data.Status.PrintInfo)
  }
}

function handle_printer_attributes(data) {
  console.log(data)
  if (!printers[data.MainboardID].hasOwnProperty('attributes')) {
    printers[data.MainboardID]['attributes'] = {}
  }
  var filter = ['Resolution', 'XYZsize', 'NumberOfVideoStreamConnected', 'MaximumVideoStreamAllowed', 'UsbDiskStatus', 'Capabilities', 'SupportFileType', 'DevicesStatus', 'ReleaseFilmMax', 'CameraStatus', 'RemainingMemory', 'TLPNoCapPos', 'TLPStartCapPos', 'TLPInterLayers']
  $.each(data.Attributes, function (key, val) {
    if (filter.includes(key)) {
      printers[data.MainboardID]['attributes'][key] = val
    }
  })
  createTable('Attributes', data.Attributes)
}

function handle_printer_files(data) {
  var id = data.Data.MainboardID
  files = []
  if (printers[id]['files'] !== undefined) {
    files = printers[id]['files']
  }
  $.each(data.Data.Data.FileList, function (i, f) {
    if (f.type === 0) {
      getPrinterFiles(id, f.name)
    } else {
      if (!files.includes(f.name)) {
        files.push(f.name)
      }
    }
  })
  printers[id]['files'] = files
  createTable('Files', files)
  addFileOptions()
}

function addPrinters(printers) {
  $.each(printers, function (id, printer) {
    var template = $("#tmplPrintersListItem").html()
    var item = $(template)
    var printerIcon = (printer.brand + '_' + printer.model).split(" ").join("").toLowerCase()
    item.attr('id', 'printer_' + id)
    item.attr("data-connection-id", printer.connection)
    item.attr("data-printer-id", id)
    item.find(".printerName").text(printer.name)
    item.find(".printerType").text(printer.brand + ' ' + printer.model)
    item.find(".printerIcon").attr("src", 'img/' + printerIcon + '.webp')
    item.on('click', function () {
      // $.each($('.printerListItem'), function () {
      //   $(this).removeClass('active')
      // })
      // $(this).addClass('active')
      showPrinter($(this).data('printer-id'))
    })
    $("#printersList").append(item)
    socket.emit("printer_info", { id: id })
  });
}

function showPrinter(id) {
  //console.log(JSON.stringify(printers[id]))
  currentPrinter = id
  var p = printers[id]
  var printerIcon = (p.brand + '_' + p.model).split(" ").join("").toLowerCase()
  $('#printerName').text(p.name)
  $('#printerType').text(p.brand + ' ' + p.model)
  $("#printerIcon").attr("src", 'img/' + printerIcon + '.webp')

  createTable('Status', p.status, true)
  createTable('Attributes', p.attributes)
  createTable('Print', p.status.PrintInfo)

  // only get files once
  if (printers[id]['files'] == undefined) {
    getPrinterFiles(id, '/local')
    if (p.attributes.UsbDiskStatus == 1) {
      getPrinterFiles(id, '/usb')
    }
  }

  $('#uploadPrinter').val(id)
  renderGcodeHistory()
  updateGcodeControls()
}

function createTable(name, data, active = false) {
  if ($('#tab-' + name).length == 0) {
    var tTab = $("#tmplNavTab").html()
    var tab = $(tTab)
    tab.find('button').attr('id', 'tab-' + name)
    tab.find('button').attr('data-bs-target', '#tab' + name)
    tab.find('button').text(name)
    if (active) {
      tab.find('button').addClass('active')
    }
    $('#navTabs').append(tab)
  }

  if ($('#tab' + name).length == 0) {
    var tPane = $("#tmplNavPane").html()
    var pane = $(tPane)
    pane.attr('id', 'tab' + name)
    pane.find('tbody').attr('id', 'table' + name)
    if (active) {
      pane.addClass('active')
    }
    $('#navPanes').append(pane)
  }
  fillTable(name, data)
}

function fillTable(table, data) {
  var t = $('#table' + table)
  t.empty()
  $.each(data, function (key, val) {
    if (typeof val === 'object') {
      val = JSON.stringify(val)
    }
    var row = $('<tr><td class="fieldKey">' + key + '</td><td class="fieldValue">' + val + '</td></tr>')
    t.append(row)
  })
}

function getPrinterFiles(id, url) {
  socket.emit("printer_files", { id: id, url: url })
}

function addFileOptions() {
  $('#tableFiles .fieldValue').each(function () {
    var file = $(this).text()
    var options = $('<i class="bi bi-printer-fill fileOption ps-3" data-action="print" data-file="' + file + '"></i><i class="bi bi-trash-fill fileOption ps-1" data-action="delete" data-file="' + file + '"></i>')
    $(this).append(options)
    $(this).parent().attr('data-file', file)
  })
  $('.fileOption').on('click', function (e) {
    var action = $(this).data('action')
    var file = $(this).data('file')
    $('#modalConfirmTitle').text('Confirm ' + action)
    $('#modalConfirmAction').text(action)
    $('#modalConfirmValue').text(file)
    $('#btnConfirm').data('action', action).data('value', file)
    modalConfirm.show()
  })
}

function updatePrinterStatus(data) {
  var info = $('#printer_' + data.MainboardID).find('.printerInfo')
  switch (data.Status.CurrentStatus[0]) {
    case SDCP_MACHINE_STATUS_IDLE:
      info.text("Idle")
      updatePrinterStatusIcon(data.MainboardID, "success", false)
      break
    case SDCP_MACHINE_STATUS_PRINTING:
      info.text("Printing")
      updatePrinterStatusIcon(data.MainboardID, "success", true)
      break
    case SDCP_MACHINE_STATUS_FILE_TRANSFERRING:
      info.text("File Transfer")
      updatePrinterStatusIcon(data.MainboardID, "warning", true)
      break
    case SDCP_MACHINE_STATUS_EXPOSURE_TESTING:
      info.text("Exposure Test")
      updatePrinterStatusIcon(data.MainboardID, "info", true)
      break
    case SDCP_MACHINE_STATUS_DEVICES_TESTING:
      info.text("Devices Self-Test")
      updatePrinterStatusIcon(data.MainboardID, "warning", true)
      break
    case SDCP_MACHINE_STATUS_UNKNOWN_8:
      info.text("UNKNOWN STATUS")
      updatePrinterStatusIcon(data.MainboardID, "info", true)
      break
    default:
      break
  }
}

function updatePrinterStatusIcon(id, style, spinner) {
  var el = 'printerStatus'
  if (spinner) {
    el = 'printerSpinner'
    $('.printerStatus').addClass('visually-hidden')
    $('.printerSpinner').removeClass('visually-hidden')
  } else {
    $('.printerStatus').removeClass('visually-hidden')
    $('.printerSpinner').addClass('visually-hidden')
  }
  var status = $('#printer_' + id).find('.' + el)
  status.removeClass(function (index, css) {
    return (css.match(/\btext-\S+/g) || []).join(' ');
  }).addClass("text-" + style);
  status.find('i').removeClass().addClass('bi-circle-fill')
}

function setServerStatus(online) {
  serverStatus = $('.serverStatus')
  if (online) {
    serverStatus.removeClass('bi-cloud text-danger').addClass('bi-cloud-check-fill')
  } else {
    serverStatus.removeClass('bi-cloud-check-fill').addClass('bi-cloud text-danger')
  }
}

$('#btnUpload').on('click', function () {
  uploadFile()
});

function uploadFile() {
  var req = $.ajax({
    url: '/upload',
    type: 'POST',
    data: new FormData($('#formUpload')[0]),
    // Tell jQuery not to process data or worry about content-type
    // You *must* include these options!
    cache: false,
    contentType: false,
    processData: false,
    // Custom XMLHttpRequest
    xhr: function () {
      var myXhr = $.ajaxSettings.xhr();
      if (myXhr.upload) {
        // For handling the progress of the upload
        myXhr.upload.addEventListener('progress', function (e) {
          if (e.lengthComputable) {
            var percent = Math.floor(e.loaded / e.total * 100);
            $('#progressUpload').text('Upload to ChitUI: ' + percent + '%').css('width', percent + '%');
            if (percent == 100) {
              setTimeout(function () {
                fileTransferProgress()
              }, 1000)
            }
          }
        }, false);
      }
      return myXhr;
    }
  })
  req.done(function (data) {
    $('#uploadFile').val('')
    setToastTimestamp($('#toastUpload .toast-timestamp'))
    uploadToast.show()
  })
  req.fail(function (data) {
    alert(data.responseJSON.msg)
  })
  req.always(function () {
  })
}

$('.serverStatus').on('mouseenter', function (e) {
  if ($(this).hasClass('bi-cloud-check-fill')) {
    $(this).removeClass('bi-cloud-check-fill').addClass('bi-cloud-plus text-primary')
  }
});

$('.serverStatus').on('mouseleave', function (e) {
  $(this).removeClass('bi-cloud-plus text-primary').addClass('bi-cloud-check-fill')
});

$('.serverStatus').on('click', function (e) {
  socket.emit("printers", "{}")
});

$('#toastUpload .btn-close').on('click', function (e) {
  $("#toastUpload").hide()
});

var modalConfirm;
$(document).ready(function () {
  modalConfirm = new bootstrap.Modal($('#modalConfirm'), {})
  commandToast = new bootstrap.Toast($('#toastCommand'))
  uploadToast = new bootstrap.Toast($('#toastUpload'))
});

$('#btnConfirm').on('click', function () {
  socket.emit('action_' + $(this).data('action'), { id: currentPrinter, data: $(this).data('value') })
  $('#tableFiles tr[data-file="' + $(this).data('value') + '"]').remove()
});

function fileTransferProgress() {
  $('#progressUpload').addClass('progress-bar-striped progress-bar-animated')
  progress = new EventSource('/progress');
  progress.onmessage = function (event) {
    if (event.data > 0) {
      $('#progressUpload').text('Upload to printer: ' + event.data + '%').css('width', event.data + '%').addClass('text-bg-warning');
    }
    if (event.data == 100) {
      setTimeout(function () {
        $('#progressUpload').text('0%').css('width', '0%');
        setTimeout(function () {
          $('#progressUpload').removeClass('progress-bar-striped progress-bar-animated text-bg-warning')
        }, 1000)
      }, 1000)
      progress.close()
    }
  };
}

function startCommandTimeout(data) {
  if (!data || !data.commandId) {
    return
  }
  if (pendingCommands[data.commandId]) {
    clearTimeout(pendingCommands[data.commandId].timeout)
  }
  showCommandToast('Command sent', `Command "${data.command}" sent to printer ${data.printerId}.`, 'info')
  pendingCommands[data.commandId] = {
    timeout: setTimeout(function () {
      resolveCommandTimeout(data.commandId, `Command "${data.command}" timed out for printer ${data.printerId}.`, 'danger')
    }, COMMAND_TIMEOUT_MS)
  }
}

function resolveCommandTimeout(commandId, message, variant = 'success') {
  if (pendingCommands[commandId]) {
    clearTimeout(pendingCommands[commandId].timeout)
    delete pendingCommands[commandId]
  }
  if (message) {
    showCommandToast('Command update', message, variant)
  }
}

function handleCommandErrorToast(data) {
  var message = data?.error?.message || data?.error || 'Unknown error'
  resolveCommandTimeout(data.commandId, `${message} (Printer: ${data.printerId || '?'})`, 'danger')
}

function showCommandToast(title, message, variant = 'info') {
  var toastEl = $('#toastCommand')
  if (!commandToast) {
    commandToast = new bootstrap.Toast(toastEl)
  }
  toastEl.find('.toast-title').text(title)
  toastEl.find('.toast-body-message').text(message)
  setToastTimestamp(toastEl.find('.toast-timestamp'))

  var toastBody = toastEl.find('.toast-body-message')
  toastBody.removeClass('text-bg-success text-bg-danger text-bg-warning text-bg-info')
  switch (variant) {
    case 'success':
      toastBody.addClass('text-bg-success')
      break
    case 'danger':
      toastBody.addClass('text-bg-danger')
      break
    case 'warning':
      toastBody.addClass('text-bg-warning')
      break
    default:
      toastBody.addClass('text-bg-info')
      break
  }
  commandToast.show()
}

function setToastTimestamp(target) {
  var now = new Date()
  var timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  target.text(timeStr)
}

/* global bootstrap: false */
(() => {
  'use strict'
  const tooltipTriggerList = Array.from(document.querySelectorAll('[data-bs-toggle="tooltip"]'))
  tooltipTriggerList.forEach(tooltipTriggerEl => {
    new bootstrap.Tooltip(tooltipTriggerEl)
  })
})()

function sendGcodeCommand(command = null) {
  if (!currentPrinter) {
    return
  }
  var cmd = (command !== null ? command : $('#gcodeInput').val()).trim()
  if (cmd.length === 0) {
    updateGcodeStatus('Enter a command to send', 'warning', currentPrinter)
    return
  }
  var commandId = Date.now().toString(16) + Math.random().toString(16).slice(2, 8)
  toggleGcodeSpinner(true)
  updateGcodeStatus('Sending…', 'info', currentPrinter)
  addGcodeHistoryEntry(currentPrinter, { commandId: commandId, command: cmd, status: 'pending', timestamp: Date.now() })
  socket.emit('gcode_command', { id: currentPrinter, command: cmd, commandId: commandId })
}

$('#btnSendGcode').on('click', function () {
  sendGcodeCommand()
})

$('#gcodeInput').on('keydown', function (e) {
  if (e.key === 'Enter') {
    e.preventDefault()
    sendGcodeCommand()
  }
})

$('#btnClearHistory').on('click', function () {
  if (!currentPrinter) return
  gcodeHistory[currentPrinter] = []
  renderGcodeHistory()
})

$('#btnCopyLast').on('click', function () {
  var last = getLastGcodeEntry()
  if (!last) return
  $('#gcodeInput').val(last.command)
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(last.command)
  }
  updateGcodeStatus('Last command copied', 'secondary', currentPrinter)
})

$('#btnResendLast').on('click', function () {
  var last = getLastGcodeEntry()
  if (!last) return
  $('#gcodeInput').val(last.command)
  sendGcodeCommand(last.command)
})

function updateGcodeControls() {
  var hasPrinter = !!currentPrinter
  $('#btnSendGcode').prop('disabled', !hasPrinter)
  $('#gcodeInput').prop('disabled', !hasPrinter)
  renderGcodeHistory()
  if (!hasPrinter) {
    updateGcodeStatus('No printer selected', 'secondary')
  } else {
    updateGcodeStatus('Ready', 'success')
  }
}

function updateGcodeStatus(text, style = 'secondary', printerId = null) {
  if (printerId && currentPrinter && printerId !== currentPrinter) {
    return
  }
  var badge = $('#gcodeStatus')
  badge.text(text)
  badge.removeClass(function (index, css) {
    return (css.match(/\btext-bg-\S+/g) || []).join(' ')
  })
  badge.addClass('text-bg-' + style)
}

function toggleGcodeSpinner(show) {
  if (show) {
    $('#gcodeSendSpinner').removeClass('visually-hidden')
    $('#btnSendGcode .send-label').addClass('visually-hidden')
  } else {
    $('#gcodeSendSpinner').addClass('visually-hidden')
    $('#btnSendGcode .send-label').removeClass('visually-hidden')
  }
}

function addGcodeHistoryEntry(printerId, entry) {
  if (!gcodeHistory[printerId]) {
    gcodeHistory[printerId] = []
  }
  gcodeHistory[printerId].push(entry)
  renderGcodeHistory()
}

function updateGcodeHistoryEntry(printerId, commandId, updates) {
  if (!printerId || !gcodeHistory[printerId]) return
  var entry = gcodeHistory[printerId].find(e => e.commandId === commandId)
  if (entry) {
    Object.assign(entry, updates)
    renderGcodeHistory()
  }
}

function renderGcodeHistory() {
  var list = $('#gcodeHistory')
  list.empty()
  var history = currentPrinter ? (gcodeHistory[currentPrinter] || []) : []
  history.slice().reverse().forEach(function (entry) {
    var statusClass = 'secondary'
    if (entry.status === 'reply') statusClass = 'success'
    else if (entry.status === 'error') statusClass = 'danger'
    else if (entry.status === 'pending') statusClass = 'info'
    else if (entry.status === 'sent') statusClass = 'primary'
    var responseText = entry.response ? '<div class="small text-body-secondary mt-1">' + entry.response + '</div>' : ''
    var item = $('<li class="list-group-item d-flex justify-content-between align-items-start"></li>')
    var body = $('<div class="ms-2 me-auto"></div>')
    body.append('<div class="fw-semibold">' + entry.command + '</div>')
    body.append(responseText)
    var time = new Date(entry.timestamp || Date.now()).toLocaleTimeString()
    body.append('<div class="small text-body-tertiary">' + time + '</div>')
    item.append(body)
    item.append('<span class="badge text-bg-' + statusClass + ' rounded-pill">' + entry.status + '</span>')
    list.append(item)
  })
  var hasHistory = history.length > 0
  $('#btnClearHistory, #btnCopyLast, #btnResendLast').prop('disabled', !hasHistory || !currentPrinter)
}

function getLastGcodeEntry() {
  if (!currentPrinter || !gcodeHistory[currentPrinter] || gcodeHistory[currentPrinter].length === 0) return null
  return gcodeHistory[currentPrinter][gcodeHistory[currentPrinter].length - 1]
}

function showGcodeToast(message) {
  $('#toastGcodeError .toast-body').text(message)
  toastGcodeError.show()
}
