import redis
import os
import yaml
import datetime

from pywb.utils.canonicalize import canonicalize


#=============================================================================
class RedisClient(object):
    def __init__(self):
        self.redis = None

    def init_redis(self, config={}):
        if self.redis:
            return

        redis_url = os.environ.get('REDISCLOUD_URL')
        if not redis_url:
            redis_url = os.environ.get('REDIS_URL')

        if not redis_url:
            redis_url = config.get('redis_url')

        if redis_url:
            self.redis = redis.StrictRedis.from_url(redis_url)
        else:
            self.redis = redis.StrictRedis()

    # CDX Caching
    def load_cdx_cache_iter(self, url, ts):
        page_key = self.get_url_key_p(ts, url)
        cdx_list = self.redis.lrange('cdx:' + page_key, 0, -1)

        if not cdx_list:
            page_key = self.get_orig_from_link(page_key)
            if page_key:
                cdx_list = self.redis.lrange('cdx:' + page_key, 0, -1)

        if not cdx_list:
            return []

        cdx_list = [yaml.load(cdx) for cdx in cdx_list]

        return cdx_list

    def save_cdx_cache_iter(self, cdx_list, url, ts):
        full_key = 'cdx:' + self.get_url_key_p(ts, url)
        for cdx in cdx_list:
            self.redis.rpush(full_key, yaml.dump(cdx))
            self.redis.expire(full_key, 180)
            yield cdx

    # Refer Link - get and set
    def get_orig_from_link(self, page_key):
        return self.redis.get('r:' + page_key)

    def set_refer_link(self, ts, url, page_key):
        self.redis.setex('r:' + self.get_url_key_p(ts, url), 180, page_key)

    # Embed Tracking
    def set_embed_entry(self, page_key, name, value):
        full_key = 'u:' + page_key
        self.redis.hset(full_key, name, value)
        self.redis.expire(full_key, 180)

    def get_all_embeds(self, wb_url):
        page_key = self.get_url_key(wb_url)
        try:
            res = self.redis.hgetall('u:' + page_key)
        except Exception as e:
            logging.debug(e)
            res = {}
        return res

    @staticmethod
    def get_url_key(wburl):
        ts = wburl.timestamp
        if not ts:
            ts = str(datetime.date.today().year)
        url = wburl.url
        return RedisClient.get_url_key_p(ts, url)

    @staticmethod
    def get_url_key_p(ts, url):
        key = ts + '/' + canonicalize(url, False)
        if not url.endswith('/'):
            key += '/'
        return key


#=============================================================================
redis_client = RedisClient()


