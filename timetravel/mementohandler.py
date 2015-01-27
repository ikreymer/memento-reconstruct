from pywb.webapp.handlers import WBHandler
from pywb.utils.statusandheaders import StatusAndHeaders
from pywb.webapp.replay_views import ReplayView

import requests
import re


#=============================================================================
class MementoHandler(WBHandler):
    def _init_replay_view(self, config):
        return ReplayView(LiveDirectLoader(), config)


#=============================================================================
class LiveDirectLoader(object):
    INSERT_ID_RX = re.compile('(.*[0-9]{1,14})(/https?://.*)')

    def __init__(self):
        self.session = requests.Session()

    def __call__(self, cdx, failed_files, cdx_loader):
        src_url = cdx['src_url']
        src_url = self.INSERT_ID_RX.sub(r'\1id_\2', src_url)
        print('SRC: ' + src_url)

        response = self.session.request(method='GET',
                                    url=src_url,
                                    #data=data,
                                    #headers=req_headers,
                                    allow_redirects=False,
                                    #proxies=proxies,
                                    stream=True,
                                    verify=False)

        statusline = str(response.status_code) + ' ' + response.reason

        headers = response.headers.items()
        stream = response.raw

        status_headers = StatusAndHeaders(statusline, headers)

        return (status_headers, stream)
