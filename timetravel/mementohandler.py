from pywb.webapp.handlers import WBHandler
from pywb.utils.statusandheaders import StatusAndHeaders
from pywb.utils.loaders import BlockLoader
from pywb.utils.timeutils import timestamp_to_sec, timestamp_now
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
import xml.etree.ElementTree as ElementTree


#=============================================================================
WBURL_RX = re.compile('(.*/)([0-9]{1,14})(\w{2}_)?(/https?://.*)')

H_TARGET_SEC = '_target_sec'

EXTRACT_ORIG_LINK = re.compile(r'<([^>]+)>;\s*rel=\"original\"')


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

        cdx_json = None
        if output != 'text':
            cdx_lines = list(cdx_lines)

            try:
                cdx_json = [dict(host=cdx['src_host'], ts=cdx['timestamp']) for cdx in cdx_lines]
                cdx_json = json.dumps(cdx_json)
            except Exception as e:
                logging.debug(e)

            cdx_lines = iter(cdx_lines)

        return self.index_reader.make_cdx_response(wbrequest,
                                                   cdx_lines,
                                                   output,
                                                   offset=offset,
                                                   cdx_json=cdx_json)

    def handle_not_found(self, wbrequest, nfe):
        response = super(MementoHandler, self).handle_not_found(wbrequest, nfe)

        if (not wbrequest.wb_url.is_query() and
            wbrequest.referrer and
            wbrequest.referrer.startswith(wbrequest.wb_prefix)):

            wb_url = WbUrl(wbrequest.referrer[len(wbrequest.wb_prefix):])

            status = response.status_headers.get_statuscode()

            if status.startswith('4') and not self.skip_missing_count(wb_url):
                key_name = 'MISSING '
            elif status.startswith('2'):
                key_name = 'LIVE '
            else:
                key_name = None

            if key_name:
                page_key = redis_client.get_url_key(wb_url)

                ts = wbrequest.wb_url.timestamp
                if not ts:
                    ts = timestamp_now()

                value = (key_name + ts + ' ' +
                          wbrequest.wb_url.url)

                save_value = str(timestamp_to_sec(ts))
                save_value += ' ' + 'text/html'

                redis_client.set_embed_entry(page_key, value, save_value)

        return response


    def skip_missing_count(self, wb_url):
        # skip browser generated .map files
        if wb_url.url.endswith('.map'):
            return True

        # skip vi_ video info check, also client-generated
        if wb_url.mod == 'vi_':
            return True

        return False


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

        self.load_archive_info_xml(config.get('memento_archive_xml'))

    def load_archive_info_xml(self, url):
        self.archive_infos = {}
        logging.debug('Loading XML from {0}'.format(url))
        if not url:
            return

        try:
            stream = BlockLoader().load(url)
        except Exception as e:
            logging.debug(e)
            logging.debug('Proceeding without xml archive info')
            return

        root = ElementTree.fromstring(stream.read())

        for link in root.findall('link'):
            name = link.get('id')
            archive = link.find('archive')
            timegate = link.find('timegate')

            if timegate is None or archive is None:
                continue

            rewritten = (archive.get('rewritten-urls') == 'yes')
            unrewritten_url = archive.get('un-rewritten-api-url', '')
            uri = timegate.get('uri')

            self.archive_infos[name] = {'uri': uri,
                                        'rewritten': rewritten,
                                        'unrewritten_url': unrewritten_url
                                       }

    def find_archive_info(self, host):
        for name, info in self.archive_infos.iteritems():
            if host in info['uri']:
                return info
        return None


    def is_embed_ref(self, url):
        """ Is this url an embedded referrer
        So far, it seems .css files are embeds that are also referrers
        """
        return url.split('?')[0].endswith('.css')

    def _do_req(self, urls, archive_host, skip_hosts):
        response = None
        for url in urls:
            response = self.session.request(method='GET',
                                            url=url,
                                            allow_redirects=False,
                                            stream=True,
                                            verify=False)

            if response is None:
                continue

            mem_date_time = response.headers.get('memento-datetime')

            if (response.status_code >= 400 and not mem_date_time):
                if (response.status_code == 403 or response.status_code >= 500):
                    # don't try again
                    skip_hosts.append(archive_host)
                    return None

                # try again
                continue

            # success
            return response

        return response

    def __call__(self, cdx, skip_hosts, cdx_loader, wbrequest):
        src_url = cdx['src_url']
        parts = urlparse.urlsplit(src_url)
        archive_host = parts.netloc

        if archive_host in skip_hosts:
            raise CaptureException('Skipping already failed: ' + archive_host)

        #src_url_id = WBURL_RX.sub(r'\1\2id_\4', src_url)

        #if src_url_id != src_url:
        #    try_urls = [src_url_id, src_url]
        #else:
        #    try_urls = [src_url]

        info = self.find_archive_info(archive_host)

        if info and info['unrewritten_url']:
            orig_url = info['unrewritten_url'].format(timestamp=cdx['timestamp'],
                                                      url=cdx['url'])
            try_urls = [orig_url]
        else:
            try_urls = [src_url]

        wbrequest.urlrewriter.rewrite_opts['orig_src_url'] = cdx['src_url']
        wbrequest.urlrewriter.rewrite_opts['archive_info'] = info

        self.session.cookies.clear()

        response = self._do_req(try_urls, archive_host, skip_hosts)

        if response is None:
            #skip_hosts.append(archive_host)
            raise CaptureException('Unsuccessful response, trying another')

        content_type = response.headers.get('content-type', 'unknown')
        content_type = content_type.split(';')[0]
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

        elif is_embed and self.is_embed_ref(cdx['url']):
            redis_client.set_refer_link(wbrequest.wb_url.timestamp,
                                        cdx['url'],
                                        page_key)

        parts = urlparse.urlsplit(src_url)

        # top page
        if not is_embed or (wbrequest.wb_url.url == wb_url.url and
                            wbrequest.wb_url.timestamp == wb_url.timestamp):
            redis_client.set_embed_entry(page_key, H_TARGET_SEC, str(cdx['sec']))
            orig_ref = redis_client.get_orig_from_link(page_key)
            #if orig_ref:
            #    orig_ts = orig_ref.split('/', 1)[0]
            #    redis_client.set_embed_entry(page_key, H_REQUEST_TS, orig_ts)

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
    def __init__(self, *args, **kwargs):
        self.session = None
        super(ReUrlRewriter, self).__init__(*args, **kwargs)

    def rewrite(self, url, mod=None):
        info = self.rewrite_opts.get('archive_info')

        # if archive info exists, and unrewrtten api exists,
        # or archive is not rewritten, use as is
        # (but add regex check for rewritten urls just in case, as they
        # may pop up in Location headers)
        if info and (info['unrewritten_url'] or not info['rewritten']):
            m = WBURL_RX.match(url)
            if m:
                if not mod:
                    mod = self.wburl.mod
                return self.prefix + m.group(2) + mod + m.group(4)
            else:
                return super(ReUrlRewriter, self).rewrite(url, mod)

        # Use HEAD request to get original url
        else:
           # don't rewrite certain urls at all
            if not url.startswith(self.NO_REWRITE_URI_PREFIX):
                url = self.urljoin(self.rewrite_opts.get('orig_src_url'), url)
                url = self.head_memento_orig(url)

            return super(ReUrlRewriter, self).rewrite(url, mod)

    def head_memento_orig(self, url):
        try:
            if not self.session:
                self.session = requests.Session()

            logging.debug('Loading HEAD Memento Headers from ' + url)
            r = self.session.head(url)
            link = r.headers.get('Link')
            if link:
                m = EXTRACT_ORIG_LINK.search(link)
                if m:
                    url = m.group(1)
                    logging.debug('Found Original: ' + url)

        except Exception as e:
            logging.debug(e)

        finally:
            return url

    def _create_rebased_rewriter(self, new_wburl, prefix):
        return ReUrlRewriter(new_wburl, prefix)
