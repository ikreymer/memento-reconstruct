from pywb.webapp.handlers import WBHandler
from pywb.utils.statusandheaders import StatusAndHeaders
from pywb.webapp.replay_views import ReplayView, CaptureException

from pywb.rewrite.wburl import WbUrl
from pywb.rewrite.url_rewriter import UrlRewriter

from pywb.framework.basehandlers import WbUrlHandler
from pywb.framework.wbrequestresponse import WbResponse

import requests
import re
import json
import os

import urlparse
import redis


#=============================================================================
WBURL_RX = re.compile('(.*/)([0-9]{1,14})(\w{2}_)?(/https?://.*)')


#=============================================================================
def init_redis(config):
    redis_url = os.environ.get('REDISCLOUD_URL')
    print('REDIS CLOUD URL: ' + redis_url)
    if not redis_url:
        redis_url = config.get('redis_url')

    if redis_url:
        return redis.StrictRedis.from_url(redis_url)
    else:
        return redis.StrictRedis()


#=============================================================================
class APIHandler(WbUrlHandler):
    def __init__(self, config):
        self.redis = init_redis(config)

    def __call__(self, wbrequest):
        res = {}

        wb_url = wbrequest.wb_url
        page_key = wb_url.timestamp + '/' + wb_url.url

        try:
            res = self.redis.hgetall('u:' + page_key)
        except as e:
            print(e)

        return WbResponse.text_response(json.dumps(res),
                                        content_type='application/json')


#=============================================================================
class MementoHandler(WBHandler):
    def _init_replay_view(self, config):
        return ReplayView(LiveDirectLoader(config), config)


#=============================================================================
class LiveDirectLoader(object):
    def __init__(self, config):
        self.session = requests.Session()
        self.redis = init_redis(config)

    @staticmethod
    def url_key(wburl):
        return wburl.timestamp + '/' + wburl.url

    def __call__(self, cdx, failed_files, cdx_loader, wbrequest):
        src_url = cdx['src_url']
        src_url = WBURL_RX.sub(r'\1\2id_\4', src_url)
        parts = urlparse.urlsplit(src_url)
        archive_host = parts.netloc

        if archive_host in failed_files:
            raise CaptureException('Skipping already failed: ' + archive_host)

        response = self.session.request(method='GET',
                                    url=src_url,
                                    #data=data,
                                    #headers=req_headers,
                                    allow_redirects=False,
                                    #proxies=proxies,
                                    stream=True,
                                    verify=False)

        if response.status_code >= 400:
            if response.status_code == 403 or response.status_code >= 500:
                failed_files.append(parts.netloc)
            raise CaptureException('Unsuccessful response, trying another')

        page_key = None
        is_embed = False
        if wbrequest.referrer and wbrequest.referrer.startswith(wbrequest.wb_prefix):
            wb_url = WbUrl(wbrequest.referrer[len(wbrequest.wb_prefix):])
            page_key = self.url_key(wb_url)
            is_embed = True
        else:
            wb_url = wbrequest.wb_url

        page_key = self.url_key(wb_url)

        if is_embed and wb_url.url.endswith('.css'):
            orig_ref = self.redis.get('r:' + page_key)
            if orig_ref:
                wb_url = WbUrl(orig_ref)
                page_key = self.url_key(wb_url)

        elif is_embed and cdx['original'].endswith('.css'):
            self.redis.setex('r:' + cdx['timestamp'] + '/' + cdx['original'], 180, page_key)

        parts = urlparse.urlsplit(src_url)

        url_entry = self.url_key(wbrequest.wb_url)

        full_key = 'u:' + page_key

        # top page
        if url_entry == page_key:
            target_sec = cdx['sec']
            self.redis.hset(full_key, '_target_sec', target_sec)
        else:
            self.redis.hset(full_key, url_entry, cdx['sec'])

        self.redis.expire(full_key, 180)

        statusline = str(response.status_code) + ' ' + response.reason

        headers = response.headers.items()

        stream = response.raw

        status_headers = StatusAndHeaders(statusline, headers)

        type_ = type(UrlRewriter.rewrite)
        wbrequest.urlrewriter._orig_rewrite = wbrequest.urlrewriter.rewrite
        wbrequest.urlrewriter.rewrite = type_(rewrite_archive, wbrequest.urlrewriter, UrlRewriter)

        return (status_headers, stream)


#=============================================================================
def rewrite_archive(self, url, mod=None):
    m = WBURL_RX.match(url)
    if m:
        print('REWRITE ARC: ' + url)
        if not mod:
            mod = ''
        return self.prefix + m.group(2) + mod + m.group(4)
    else:
        return self._orig_rewrite(url, mod)
