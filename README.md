Memento Cross-Archive Replay Service
====================================

Uses the memento api to provide a unified replay system across multiple existing archives.

Installation
~~~~~~~~~~~~

1. `python setup.py install`

2. An instance of redis is required. On ubuntu, can be installed with `sudo apt-get install redis-server`

   Optionally, the `REDISCLOUD_URL` can be set to configure path to redis using the form: `redis://host:port/db`

   (Redis url for default redis configuration is: `redis://localhost:6379/0`)

3. Run with `./run-uwsgi.sh` or just `uwsgi uwsgi.ini` to start uwsgi. The UPORT env can be configured to specify a uwsgi port
