import requests
import sys
import calendar
import itertools

from collections import namedtuple

from pywb.cdx.cdxobject import CDXObject
from pywb.utils.canonicalize import canonicalize
from pywb.utils.timeutils import iso_date_to_datetime, datetime_to_timestamp
from pywb.utils.timeutils import timestamp_to_sec
from pywb.utils.wbexception import AccessException, NotFoundException

import logging


EXCLUDE_LIST = ('http://archive.today/')

#=============================================================================
def datetime_to_secs(dt):
    return calendar.timegm(dt.utctimetuple())


#=============================================================================
class MemValue(object):
    """ Simple wrapper to hold timestamp,
    epoch seconds, and memento url
    """
    def __init__(self, ts, sec, url):
        self.ts = ts
        self.sec = sec
        self.url = url

    def use_ts_url(self):
        """ clears secs to invalidate,
        returns sec, url
        """
        self.sec = None
        return self.ts, self.url


#=============================================================================
class MementoApi(object):
    def __init__(self, paths):
        self.api_endpoint = paths[0]
        self.timemap_endpoint = paths[1]
        self.session = requests.Session()

    def timegate_query(self, timestamp, url):
        full = self.api_endpoint + timestamp + '/' + url
        #print('LOADING: ' + full)
        try:
            r = self.session.get(full)
            result = r.json()
        except:
            msg = 'No Mementos Found'
            raise NotFoundException(msg, url=url)

        return result['mementos']

    def timemap_query(self, url, page=1):
        full = self.timemap_endpoint + '/' + str(page) + '/' + url
        #print('LOADING: ' + full)
        r = self.session.get(full)
        result = r.json()

        return result['mementos']

    def parse_mem_value(self, m):
        iso = m['datetime']
        dt = iso_date_to_datetime(iso)
        sec = datetime_to_secs(dt)
        ts = datetime_to_timestamp(dt)
        url = m['uri']

        return MemValue(ts, sec, url)


#=============================================================================
class MementoTimemapQuery(object):
    def __init__(self, api_loader, url):
        self.api_loader = api_loader

        mementos = api_loader.timemap_query(url)
        self.memento_list = mementos['list']
        self.memento_iter = iter(self.memento_list)

    def __iter__(self):
        return self

    def next(self):
        return self.api_loader.parse_mem_value(self.memento_iter.next())


#=============================================================================
class MementoClosestQuery(object):
    """ Provides an iterator over memento JSON API, returning
    results closest to the requested timestamp, and checking
    next-closest which each iteration
    """
    def __init__(self, api_loader, url, timestamp):
        self.api_loader = api_loader
        self.url = url
        self.target_sec = timestamp_to_sec(timestamp)

        mementos = self.api_loader.timegate_query(timestamp, self.url)

        self.m_closest = self._get_mem_info(mementos, 'closest')
        self.m_next = self._get_mem_info(mementos, 'next')
        self.m_prev = self._get_mem_info(mementos, 'prev')

    def _get_mem_info(self, mementos, name):
        m = mementos.get(name)
        if not m:
            return None

        return self.api_loader.parse_mem_value(m)

    def __iter__(self):
        return self

    def next(self):
        if self.m_closest and self.m_closest.sec:
            return self.m_closest.use_ts_url()

        if self.m_next and not self.m_next.sec:
            mementos = self.api_loader.timegate_query(self.m_next.ts, self.url)
            self.m_next = self._get_mem_info(mementos, 'next')

        if self.m_prev and not self.m_prev.sec:
            mementos = self.api_loader.timegate_query(self.m_prev.ts, self.url)
            self.m_prev = self._get_mem_info(mementos, 'prev')

        if not self.m_next and self.m_prev:
            return self.m_prev.use_ts_url()
        elif self.m_next and not self.m_prev:
            return self.m_next.use_ts_url()
        elif not self.m_next and not self.m_prev:
            raise StopIteration()

        if (abs(self.m_next.sec - self.target_sec) < abs(self.m_prev.sec - self.target_sec)):
            return self.m_next.use_ts_url()
        else:
            return self.m_prev.use_ts_url()

        return res


#=============================================================================
class MementoIndexServer(object):
    def __init__(self, paths, **kwargs):
        self.loader = MementoApi(paths)
        logging.basicConfig(level=logging.DEBUG)

    def load_cdx(self, **params):
        sort = params.get('sort')
        if sort == 'closest' or sort == 'reverse':
            closest = params.get('closest')
            if not closest:
                closest = '3000'

            mem_iter = MementoClosestQuery(self.loader, params['url'], closest)
        else:
            mem_iter = MementoTimemapQuery(self.loader, params['url'])

        mem_iter = self.memento_to_cdx(params['url'], mem_iter)
        return mem_iter

    def memento_to_cdx(self, url, mem_iter):
        key = canonicalize(url)

        for ts, target in mem_iter:
            if target.startswith(EXCLUDE_LIST):
                continue

            cdx = CDXObject()
            cdx['urlkey'] = key
            cdx['timestamp'] = ts
            cdx['original'] = url
            cdx['src_url'] = target
            yield cdx
            #cdx['mimetype'] = '-'
            #cdx['statuscode'] = '200'
            #cdx['digest'] = '-'
            #cdx['length'] = '-1'
            #cdx['offset'] = '0'
            #cdx['filename'] = filename


def memento_to_cdx(url, mem):
    key = canonicalize(url)
    for ts, target in mem:
        yield key + ' ' + ts + ' ' + url + ' ' + target


def main():
    loader = MementoApi(['http://timetravel.mementoweb.org/api/json/',
                         'http://timetravel.mementoweb.org/timemap/json/'])

    q = MementoClosestQuery(loader, sys.argv[2], sys.argv[1])

    n = int(sys.argv[3])
    q = memento_to_cdx(sys.argv[2], q)
    for v, _ in itertools.izip(q, xrange(0, n)):
        print(v)

if __name__ == "__main__":
    main()
