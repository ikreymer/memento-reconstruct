from pywb.webapp.handlers import WBHandler
from pywb.utils.statusandheaders import StatusAndHeaders
from pywb.webapp.replay_views import ReplayView, CaptureException
from pywb.utils.canonicalize import canonicalize


from pywb.rewrite.wburl import WbUrl
from pywb.rewrite.url_rewriter import UrlRewriter

from pywb.framework.basehandlers import WbUrlHandler
from pywb.framework.wbrequestresponse import WbResponse

import requests
import logging
import re
import json
import os

import urlparse
import redis


#=============================================================================
WBURL_RX = re.compile('(.*/)([0-9]{1,14})(\w{2}_)?(/https?://.*)')

redis_cli = None

#=============================================================================
def init_redis(config):
    global redis_cli
    if redis_cli:
        return redis_cli

    redis_url = os.environ.get('REDISCLOUD_URL')
    if not redis_url:
        redis_url = config.get('redis_url')

    if redis_url:
        redis_cli = redis.StrictRedis.from_url(redis_url)
    else:
        redis_cli = redis.StrictRedis()

    return redis_cli


#=============================================================================
def get_url_key(wburl):
    return get_url_key_p(wburl.timestamp, wburl.url)


def get_url_key_p(ts, url):
    return ts + '/' + canonicalize(url, False)


#=============================================================================
class APIHandler(WbUrlHandler):
    def __init__(self, config):
        self.redis = init_redis(config)

    def __call__(self, wbrequest):
        res = {}

        wb_url = wbrequest.wb_url
        page_key = get_url_key(wb_url)

        try:
            res = self.redis.hgetall('u:' + page_key)
        except Exception as e:
            logging.debug(e)

        return WbResponse.text_response(json.dumps(res),
                                        content_type='application/json')


#=============================================================================
class MementoHandler(WBHandler):
    def _init_replay_view(self, config):
        return ReplayView(LiveDirectLoader(config), config)

    def handle_query(self, wbrequest, cdx_lines, output):
        try:
            offset = int(wbrequest.wb_url.timestamp)
            if offset < 1:
                offset = 1
        except Exception as e:
            offset = 1

        cdx_lines = list(cdx_lines)

        try:
            cdx_json = [dict(host=cdx['src_host'], ts=cdx['timestamp']) for cdx in cdx_lines]
            cdx_json = json.dumps(cdx_json)
        except Exception as e:
            logging.debug(e)

        return self.index_reader.make_cdx_response(wbrequest,
                                                   cdx_lines,
                                                   output,
                                                   offset=offset,
                                                   cdx_json=cdx_json)


#=============================================================================
class LiveDirectLoader(object):
    def __init__(self, config):
        self.session = requests.Session()
        self.redis = init_redis(config)

    def is_embed_ref(self, url):
        """ Is this url an embedded referrer
        So far, it seems .css files are embeds that are also referrers
        """
        return url.split('?')[0].endswith('.css')

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
            is_embed = True
        else:
            wb_url = wbrequest.wb_url

        page_key = get_url_key(wb_url)

        if is_embed and self.is_embed_ref(wb_url.url):
            orig_ref = self.redis.get('r:' + page_key)
            if orig_ref:
                wb_url = WbUrl(orig_ref)
                page_key = get_url_key(wb_url)

        elif is_embed and self.is_embed_ref(cdx['original']):
            self.redis.setex('r:' + get_url_key_p(cdx['timestamp'], cdx['original']), 180, page_key)

        parts = urlparse.urlsplit(src_url)

        full_key = 'u:' + page_key

        # top page
        #if not is_embed or (wbrequest.wb_url.url == wb_url.url and
        #                    wbrequest.wb_url.timestamp == wb_url.timestamp):
        #    target_sec = cdx['sec']
        #    self.redis.hset(full_key, '_target_sec', target_sec)

        value = (parts.netloc + ' ' +
                 wbrequest.wb_url.timestamp + ' ' +
                 wbrequest.wb_url.url)

        self.redis.hset(full_key, value, cdx['sec'])
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
