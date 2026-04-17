"""
E2E test backend startup script.

Patches socket.getfqdn to avoid the 35-second DNS lookup on macOS,
then starts the Flask backend without debug mode.
"""
import os
import sys
import socket

# Patch getfqdn to avoid slow DNS resolution on macOS
_original_getfqdn = socket.getfqdn
socket.getfqdn = lambda name='': name or 'localhost'

# Ensure the project root is on the Python path
project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, project_root)
os.chdir(project_root)

from app.main import create_app

if __name__ == '__main__':
    app = create_app()
    app.run(debug=False, host='127.0.0.1', port=5000, use_reloader=False)
