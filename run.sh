#!/bin/sh
python setup.py install
uwsgi uwsgi.ini
