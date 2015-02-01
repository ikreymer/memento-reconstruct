#!/bin/bash
pip install -U git+git://github.com/ikreymer/pywb.git@develop
python setup.py install
uwsgi uwsgi.ini
