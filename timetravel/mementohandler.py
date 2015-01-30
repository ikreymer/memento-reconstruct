from pywb.webapp.handlers import WBHandler
from pywb.utils.statusandheaders import StatusAndHeaders
from pywb.webapp.replay_views import ReplayView, CaptureException

from pywb.rewrite.wburl import WbUrl
from pywb.rewrite.url_rewriter import UrlRewriter

from pywb.framework.cache import create_cache

import requests
import re

import urlparse
import redis


WBURL_RX = re.compile('(.*/)([0-9]{1,14})(\w{2}_)?(/https?://.*)')


#=============================================================================
class MementoHandler(WBHandler):
    def _init_replay_view(self, config):
        return ReplayView(LiveDirectLoader(), config)


#=============================================================================
class LiveDirectLoader(object):
    def __init__(self):
        self.session = requests.Session()
        self.redis = redis.StrictRedis()

        #self.cache = create_cache()

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

        page_key = wb_url.timestamp + '/' + wb_url.url

        if is_embed and wb_url.url.endswith('.css'):
            orig_ref = self.redis.get('r:' + page_key)
            if orig_ref:
                wb_url = WbUrl(orig_ref)
                page_key = wb_url.timestamp + '/' + wb_url.url

        elif is_embed and cdx['original'].endswith('.css'):
            self.redis.setex('r:' + cdx['timestamp'] + '/' + cdx['original'], 180, page_key)

        parts = urlparse.urlsplit(src_url)

        self.redis.hincrby(page_key, 'h:' + parts.netloc, 1)
        self.redis.expire(page_key, 600)

        target_sec = self.redis.hget(page_key, 'target_sec')
        if not target_sec:
            target_sec = cdx['sec']
            self.redis.hset(page_key, 'target_sec', target_sec)
        else:
            diff = (cdx['sec'] - int(target_sec)) / (60 * 60)
            self.redis.hincrby(page_key, 'd:' + str(diff), 1)

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
