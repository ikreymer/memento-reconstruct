Memento Reconstruct: A Cross-Archive Replay Service
===================================================

Memento Reconstruct is a unified replay system based on the memento api to provide across multiple existing archives.

The system is also deployed at http://timetravel.mementoweb.org/

## Deployment -- Docker

Memento Reconstruct supports full deployment via Docker compose.

To use, simply run ``docker-compose up``


## Deployment -- Local Installation

For local installation, Python and Redis are required.

1. `python setup.py install`

2. An instance of redis is required. On Ubuntu, can be installed with `sudo apt-get install redis-server`

   Optionally, the `REDIS_URL` can be set to configure path to redis using the form: `redis://host:port/db`

   (Redis url for default redis configuration is: `redis://localhost:6379/0`)


3. Run with `./run-uwsgi.sh` or just `uwsgi uwsgi.ini` to start uwsgi. The UPORT env can be configured to specify a uwsgi port



