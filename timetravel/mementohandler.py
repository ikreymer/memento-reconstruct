from pywb.webapp.handlers import WBHandler
from pywb.utils.statusandheaders import StatusAndHeaders
from pywb.webapp.replay_views import ReplayView, CaptureException

from pywb.rewrite.wburl import WbUrl
from pywb.rewrite.url_rewriter import UrlRewriter
from pywb.utils.wbexception import AccessException, NotFoundException

from pywb.framework.basehandlers import WbUrlHandler
from pywb.framework.wbrequestresponse import WbResponse

from redis_client import redis_client

import requests
import logging
import re
import json
import os

import urlparse

#=============================================================================
WBURL_RX = re.compile('(.*/)([0-9]{1,14})(\w{2}_)?(/https?://.*)')

H_TARGET_SEC = '_target_sec'
H_REQUEST_TS = '_request_ts'


#=============================================================================
class APIHandler(WbUrlHandler):
    def __init__(self, config):
        pass

    def __call__(self, wbrequest):
        wb_url = wbrequest.wb_url

        res = redis_client.get_all_embeds(wb_url)

        return WbResponse.text_response(json.dumps(res),
                                        content_type='application/json')


#=============================================================================
class MementoHandler(WBHandler):
    def _init_replay_view(self, config):
        return RedirectTrackReplayView(LiveDirectLoader(config), config)

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

    def handle_request(self, wbrequest):
        try:
            return super(MementoHandler, self).handle_request(wbrequest)
        except NotFoundException as nfe:
            if wbrequest.referrer and wbrequest.referrer.startswith(wbrequest.wb_prefix):
                wb_url = WbUrl(wbrequest.referrer[len(wbrequest.wb_prefix):])
                page_key = redis_client.get_url_key(wb_url)

                value = ('MISSING ' +
                          wbrequest.wb_url.timestamp + ' ' +
                          wbrequest.wb_url.url)

                redis_client.set_embed_entry(page_key, value, '0')


            return self.handle_not_found(wbrequest, nfe)

#=============================================================================
class RedirectTrackReplayView(ReplayView):
    def _redirect_if_needed(self, wbrequest, cdx):
        res = super(RedirectTrackReplayView, self)._redirect_if_needed(wbrequest, cdx)
        if res:
            loc = res.status_headers.get_header('Location')
            if loc and loc.startswith(wbrequest.wb_prefix):
                loc = loc[len(wbrequest.wb_prefix):]
                loc_url = WbUrl(loc)

                page_key = redis_client.get_url_key(wbrequest.wb_url)
                redis_client.set_refer_link(loc_url.timestamp,
                                            loc_url.url,
                                            page_key)

        return res


#=============================================================================
class LiveDirectLoader(object):
    def __init__(self, config):
        self.session = requests.Session()
        # init redis here only
        redis_client.init_redis(config)

    def is_embed_ref(self, url):
        """ Is this url an embedded referrer
        So far, it seems .css files are embeds that are also referrers
        """
        return url.split('?')[0].endswith('.css')

    def _do_req(self, urls):
        for url in urls:
            response = self.session.request(method='GET',
                                            url=url,
                                            allow_redirects=False,
                                            stream=True,
                                            verify=False)

            if ((response is not None) and 
                response.status_code >= 400 and
                not response.headers.get('memento-datetime')):
                response = None
                continue

            return response

        return response

    def __call__(self, cdx, failed_files, cdx_loader, wbrequest):
        src_url = cdx['src_url']
        parts = urlparse.urlsplit(src_url)
        archive_host = parts.netloc

        if archive_host in failed_files:
            raise CaptureException('Skipping already failed: ' + archive_host)

        src_url_id = WBURL_RX.sub(r'\1\2id_\4', src_url)

        response = self._do_req((src_url_id, src_url))

        if response is None:
            failed_files.append(archive_host)
            raise CaptureException('Unsuccessful response, trying another')

        mem_date_time = response.headers.get('memento-datetime', 'mem')

        if (response.status_code >= 400 and not mem_date_time):
            if response.status_code == 403 or response.status_code >= 500:
                failed_files.append(archive_host)
            raise CaptureException('Unsuccessful response, trying another')

        content_type = response.headers.get('content-type', 'unknown')
        content_type = content_type.split(' ')[0]
        # for now, disable referrer for html to avoid links being treated as part of same page
        # for frames, must assemble on client side
        if 'text/html' in content_type:
            referrer = None
        else:
            referrer = wbrequest.referrer

        page_key = None
        is_embed = False
        if referrer and wbrequest.referrer.startswith(wbrequest.wb_prefix):
            wb_url = WbUrl(wbrequest.referrer[len(wbrequest.wb_prefix):])
            is_embed = True
        else:
            wb_url = wbrequest.wb_url

        page_key = redis_client.get_url_key(wb_url)

        if is_embed and self.is_embed_ref(wb_url.url):
            orig_ref = redis_client.get_orig_from_link(page_key)
            if orig_ref:
                wb_url = WbUrl(orig_ref)
                page_key = redis_client.get_url_key(wb_url)

        elif is_embed and self.is_embed_ref(cdx['original']):
            redis_client.set_refer_link(cdx['timestamp'],
                                        cdx['original'],
                                        page_key)

        parts = urlparse.urlsplit(src_url)

        # top page
        if not is_embed or (wbrequest.wb_url.url == wb_url.url and
                            wbrequest.wb_url.timestamp == wb_url.timestamp):
            redis_client.set_embed_entry(page_key, H_TARGET_SEC, str(cdx['sec']))
            orig_ref = redis_client.get_orig_from_link(page_key)
            if orig_ref:
                orig_ts = orig_ref.split('/', 1)[0]
                redis_client.set_embed_entry(page_key, H_REQUEST_TS, orig_ts)

        value = (parts.netloc + ' ' +
                 wbrequest.wb_url.timestamp + ' ' +
                 wbrequest.wb_url.url)

        redis_client.set_embed_entry(page_key, value, str(cdx['sec']) + ' ' + content_type)

        
        statusline = str(response.status_code) + ' ' + response.reason

        headers = response.headers.items()

        stream = response.raw

        status_headers = StatusAndHeaders(statusline, headers)

        #type_ = type(UrlRewriter.rewrite)
        #wbrequest.urlrewriter._orig_rewrite = wbrequest.urlrewriter.rewrite
        #wbrequest.urlrewriter.rewrite = type_(rewrite_archive, wbrequest.urlrewriter, UrlRewriter)

        return (status_headers, stream)


#=============================================================================
class ReUrlRewriter(UrlRewriter):
    def rewrite(self, url, mod=None):
        m = WBURL_RX.match(url)
        if m:
            if not mod:
                mod = ''
            return self.prefix + m.group(2) + mod + m.group(4)
        else:
            return super(ReUrlRewriter, self).rewrite(url, mod)

    def _create_rebased_rewriter(self, new_wburl, prefix):
        return ReUrlRewriter(new_wburl, prefix)
