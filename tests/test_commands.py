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

    def tearDown(self):
        main.printers.clear()
        main.printers.update(self.printers_backup)
        main.websockets.clear()
        main.websockets.update(self.websockets_backup)

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


if __name__ == '__main__':
    unittest.main()
