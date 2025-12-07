import json
import os
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import main


class TestCommandValidation(unittest.TestCase):
    def setUp(self):
        self.printers_backup = dict(main.printers)
        self.websockets_backup = dict(main.websockets)
        self.history_backup = dict(main.command_history)
        self.whitelist_backup = set(main.COMMAND_WHITELIST)
        self.blacklist_backup = set(main.COMMAND_BLACKLIST)

    def tearDown(self):
        main.printers.clear()
        main.printers.update(self.printers_backup)
        main.websockets.clear()
        main.websockets.update(self.websockets_backup)
        main.command_history.clear()
        main.command_history.update(self.history_backup)
        main.COMMAND_WHITELIST.clear()
        main.COMMAND_WHITELIST.update(self.whitelist_backup)
        main.COMMAND_BLACKLIST.clear()
        main.COMMAND_BLACKLIST.update(self.blacklist_backup)

    def test_invalid_printer_emits_error_payload(self):
        with patch.object(main.socketio, 'emit') as emit_mock:
            is_valid = main.validate_command_payload('missing', 'M105', 'cmd-1', 'firmware_error')

        self.assertFalse(is_valid)
        emit_mock.assert_called_once()
        args, _ = emit_mock.call_args
        self.assertEqual(args[0], 'firmware_error')
        payload = args[1]
        self.assertEqual(payload['commandId'], 'cmd-1')
        self.assertEqual(payload['printerId'], 'missing')
        self.assertIn('connected', payload['error']['message'])

    def test_send_printer_cmd_logs_missing_socket(self):
        main.printers['printer-1'] = {'connection': 'abc'}
        with patch.object(main.logger, 'error') as error_mock:
            result = main.send_printer_cmd('printer-1', 0)

        self.assertIsNone(result)
        error_mock.assert_called()
        logged_message = error_mock.call_args[0][0]
        self.assertIn('no active websocket', logged_message)

    def test_send_printer_cmd_logs_exceptions(self):
        class BrokenSocket:
            def send(self, *_):
                raise RuntimeError('boom')

        main.printers['printer-2'] = {'connection': 'xyz'}
        main.websockets['printer-2'] = BrokenSocket()

        with patch.object(main.logger, 'error') as error_mock:
            result = main.send_printer_cmd('printer-2', 0)

        self.assertIsNone(result)
        error_mock.assert_called()
        logged_message = error_mock.call_args[0][0]
        self.assertIn('Failed to send command', logged_message)

    def test_validate_command_enforces_whitelist(self):
        main.COMMAND_WHITELIST.clear()
        main.COMMAND_WHITELIST.update({'M105'})
        main.printers['printer-1'] = {'connection': 'abc'}
        main.websockets['printer-1'] = object()

        with patch.object(main.socketio, 'emit') as emit_mock:
            is_valid = main.validate_command_payload(
                'printer-1', 'M8513', 'cmd-2', 'firmware_error')

        self.assertFalse(is_valid)
        emit_mock.assert_called_once()
        args, _ = emit_mock.call_args
        self.assertEqual(args[0], 'firmware_error')
        payload = args[1]
        self.assertEqual(payload['commandId'], 'cmd-2')
        self.assertEqual(payload['printerId'], 'printer-1')
        self.assertEqual(payload['error']['message'], 'Command not allowed')

    def test_validate_command_enforces_blacklist(self):
        main.COMMAND_BLACKLIST.clear()
        main.COMMAND_BLACKLIST.update({'M8513'})
        main.printers['printer-1'] = {'connection': 'abc'}
        main.websockets['printer-1'] = object()

        with patch.object(main.socketio, 'emit') as emit_mock:
            is_valid = main.validate_command_payload(
                'printer-1', 'M8513', 'cmd-3', 'firmware_error')

        self.assertFalse(is_valid)
        emit_mock.assert_called_once()
        args, _ = emit_mock.call_args
        self.assertEqual(args[0], 'firmware_error')
        payload = args[1]
        self.assertEqual(payload['commandId'], 'cmd-3')
        self.assertEqual(payload['printerId'], 'printer-1')
        self.assertEqual(payload['error']['message'], 'Command not allowed')

    def test_validate_command_rejects_empty(self):
        main.printers['printer-1'] = {'connection': 'abc'}
        main.websockets['printer-1'] = object()

        with patch.object(main.socketio, 'emit') as emit_mock:
            is_valid = main.validate_command_payload(
                'printer-1', '', 'cmd-4', 'firmware_error')

        self.assertFalse(is_valid)
        emit_mock.assert_called_once()
        args, _ = emit_mock.call_args
        self.assertEqual(args[0], 'firmware_error')
        payload = args[1]
        self.assertEqual(payload['commandId'], 'cmd-4')
        self.assertEqual(payload['printerId'], 'printer-1')
        self.assertEqual(payload['error']['message'], 'Command must not be empty')


class TestEventDispatching(unittest.TestCase):
    def setUp(self):
        self.history_backup = dict(main.command_history)
        main.command_history.clear()

    def tearDown(self):
        main.command_history.clear()
        main.command_history.update(self.history_backup)

    def test_ws_msg_handler_records_history_and_emits(self):
        payload = {
            "Topic": "sdcp/response/printer-1",
            "Data": {
                "MainboardID": "printer-1",
                "RequestID": "cmd-123",
                "Data": {"Message": "ok"}
            }
        }

        with patch.object(main.socketio, 'emit') as emit_mock:
            main.ws_msg_handler(None, json.dumps(payload))

        history = main.command_history.get('printer-1', [])
        self.assertEqual(len(history), 1)
        self.assertEqual(history[0]['commandId'], 'cmd-123')
        self.assertEqual(history[0]['type'], 'response')
        self.assertEqual(history[0]['payload']['Data']['Message'], 'ok')

        emitted_events = [call[0][0] for call in emit_mock.call_args_list]
        self.assertIn('printer_response', emitted_events)
        self.assertIn('firmware_response', emitted_events)
        self.assertIn('gcode_response', emitted_events)


class TestRequestReplyIntegration(unittest.TestCase):
    def setUp(self):
        self.printers_backup = dict(main.printers)
        self.websockets_backup = dict(main.websockets)
        self.history_backup = dict(main.command_history)
        main.printers.clear()
        main.websockets.clear()
        main.command_history.clear()

    def tearDown(self):
        main.printers.clear()
        main.printers.update(self.printers_backup)
        main.websockets.clear()
        main.websockets.update(self.websockets_backup)
        main.command_history.clear()
        main.command_history.update(self.history_backup)

    def test_request_reply_flow_with_mock_printer(self):
        class FakeSocket:
            def __init__(self):
                self.sent_payloads = []

            def send(self, data):
                self.sent_payloads.append(json.loads(data))

        main.printers['printer-1'] = {
            'connection': 'conn-1',
            'ip': '192.0.2.1',
            'name': 'Mock Printer'
        }
        fake_socket = FakeSocket()
        main.websockets['printer-1'] = fake_socket

        with patch.object(main.socketio, 'emit') as emit_mock:
            request_id = main.send_firmware_command('printer-1', 'M105', 'cmd-321')

        self.assertEqual(request_id, 'cmd-321')
        self.assertEqual(len(fake_socket.sent_payloads), 1)
        sent = fake_socket.sent_payloads[0]
        self.assertEqual(sent['Data']['RequestID'], 'cmd-321')
        self.assertEqual(sent['Data']['Cmd'], 512)
        self.assertEqual(sent['Data']['Data']['Command'], 'M105')

        response_payload = {
            "Topic": "sdcp/response/printer-1",
            "Data": {
                "MainboardID": "printer-1",
                "RequestID": "cmd-321",
                "Data": {"Message": "ok"}
            }
        }

        with patch.object(main.socketio, 'emit') as emit_mock:
            main.ws_msg_handler(None, json.dumps(response_payload))

        history = main.command_history.get('printer-1', [])
        self.assertEqual(len(history), 1)
        self.assertEqual(history[0]['commandId'], 'cmd-321')
        self.assertEqual(history[0]['payload']['Data']['Message'], 'ok')

        emitted_events = [call[0][0] for call in emit_mock.call_args_list]
        self.assertIn('printer_response', emitted_events)
        self.assertIn('firmware_response', emitted_events)
        self.assertIn('gcode_response', emitted_events)


if __name__ == '__main__':
    unittest.main()
