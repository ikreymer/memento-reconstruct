import requests
import sys
import calendar
import itertools

from collections import namedtuple

from pywb.utils.canonicalize import canonicalize
from pywb.utils.timeutils import iso_date_to_datetime, datetime_to_timestamp
from pywb.utils.timeutils import timestamp_to_sec
 
def datetime_to_secs(dt):
    return calendar.timegm(dt.utctimetuple())


#=============================================================================
class MemInfo(object):
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
class MementoAggClosestQuery(object):
    """ Provides an iterator over memento JSON API, returning
    results closest to the requested timestamp, and checking
    next-closest which each iteration
    """
    def __init__(self, url, timestamp, endpoint='http://timetravel.mementoweb.org/api/json/'):
        self.endpoint = endpoint
        self.url = url
        self.target_sec = timestamp_to_sec(timestamp)

        mementos = self.query_memento_api(timestamp)

        self.m_closest = self._get_mem_info(mementos, 'closest')
        self.m_next = self._get_mem_info(mementos, 'next')
        self.m_prev = self._get_mem_info(mementos, 'prev')

    def query_memento_api(self, timestamp):
        full = self.endpoint + timestamp + '/' + self.url
        r = requests.get(full)
        result = r.json()

        return result['mementos']

    def _get_mem_info(self, mementos, name):
        m = mementos.get(name)
        if not m:
            return None

        iso = m['datetime']
        dt = iso_date_to_datetime(iso)
        sec = datetime_to_secs(dt)
        ts = datetime_to_timestamp(dt)
        url = m['uri']

        return MemInfo(ts, sec, url)

    def __iter__(self):
        return self
    
    def next(self):
        if self.m_closest and self.m_closest.sec:
            return self.m_closest.use_ts_url()

        if self.m_next and not self.m_next.sec:
            mementos = self.query_memento_api(self.m_next.ts)
            self.m_next = self._get_mem_info(mementos, 'next')

        if self.m_prev and not self.m_prev.sec:
            mementos = self.query_memento_api(self.m_prev.ts)
            self.m_prev = self._get_mem_info(mementos, 'prev')
        
        if not self.m_next and self.m_prev:
            return self.m_prev.use_ts_url()
        elif self.m_next and not self.m_prev:
            return self.m_prev.use_ts_url()
        elif not self.m_next and not self.m_prev:
            raise StopIteration()
   
        if (abs(self.m_next.sec - self.target_sec) < abs(self.m_prev.sec - self.target_sec)):
            return self.m_next.use_ts_url()
        else:
            return self.m_prev.use_ts_url()
        
        return res



def memento_to_cdx(self, ts, key, url, filename):
    cdx = CDXObject()
    cdx['urlkey'] = key
    cdx['timestamp'] = ts
    cdx['original'] = url
    cdx['mimetype'] = '-'
    cdx['statuscode'] = '200'
    cdx['digest'] = '-'
    cdx['length'] = '-1'
    cdx['offset'] = '0'
    cdx['filename'] = filename
    return cdx



def memento_to_cdx(url, mem):
    key = canonicalize(url)
    for ts, target in mem:
        yield key + ' ' + ts + ' ' + url + ' ' + target
        

def main():
    q = MementoApiQuery(sys.argv[2], sys.argv[1])
    n = int(sys.argv[3])
    q = memento_to_cdx(sys.argv[2], q)
    for v, _ in itertools.izip(q, xrange(0, n)):
        print(v)

if __name__ == "__main__":
    main()
