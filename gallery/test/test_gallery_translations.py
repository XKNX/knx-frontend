"""Reference resolution is tested without downloading Core during ordinary checks."""
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "script"))
import gallery_translations as translations


class TranslationTests(unittest.TestCase):
    def test_all_nested_panel_keys_and_references_are_copied(self):
        sources = {
            ("common",): {"state": {"on": "On"}},
            ("component", "knx"): {"config_panel": {
                "used": "[%key:common::state::on%]",
                "future": {"title": "[%key:component::knx::config_panel::used%]"},
            }},
            ("component", "light"): {"title": "Light"},
            ("component", "sensor"): {"title": "Sensor"},
        }
        with patch.object(translations, "source", side_effect=sources.__getitem__):
            self.assertEqual(translations.generate(), {
                "component.knx.config_panel.future.title": "On",
                "component.knx.config_panel.used": "On",
                "component.light.title": "Light", "component.sensor.title": "Sensor",
            })

    def test_recursive_reference_fails_instead_of_hanging(self):
        with patch.object(translations, "source", return_value={"loop": "[%key:common::loop%]"}):
            with self.assertRaisesRegex(ValueError, "Cyclic"):
                translations.resolved("[%key:common::loop%]")

    def test_missing_reference_is_not_silently_replaced(self):
        with patch.object(translations, "source", return_value={}):
            with self.assertRaises(KeyError):
                translations.resolved("[%key:common::missing%]")
