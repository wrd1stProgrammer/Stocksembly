import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("bootstrap", Path(__file__).with_name("update-web-bootstrap.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class BootstrapTest(unittest.TestCase):
    def test_preserves_database_and_removes_provider_copies(self):
        original = {
            "awsEnv": "STOCKSEMBLY_DATABASE_SECRET_ARN=database\nGA4_API_SECRET=old\n",
            "appEnv": "WHOP_API_KEY=old\nSENTRY_RELEASE=old\nKEEP=value\n",
        }
        result = module.prepare_config(original, {"GITHUB_SHA": "release", "SENTRY_DSN": "dsn"})
        self.assertIn("STOCKSEMBLY_DATABASE_SECRET_ARN=database", result["awsEnv"])
        self.assertNotIn("GA4_", result["awsEnv"])
        self.assertNotIn("WHOP_", result["appEnv"])
        self.assertIn("KEEP=value", result["appEnv"])
        self.assertIn("SENTRY_RELEASE=release", result["appEnv"])
        self.assertEqual(result, module.prepare_config(result, {"GITHUB_SHA": "release", "SENTRY_DSN": "dsn"}))

    def test_rejects_executable_configuration(self):
        with self.assertRaises(ValueError):
            module.prepare_config({"awsEnv": "", "appEnv": "NODE_OPTIONS=--require bad"}, {"GITHUB_SHA": "release"})


if __name__ == "__main__":
    unittest.main()
