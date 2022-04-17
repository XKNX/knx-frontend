"""Constants for KNX Panel."""
from typing import Awaitable, Callable, Final

from xknx.telegram import Telegram

KNX_DOMAIN: Final = "knx"

AsyncMessageCallbackType = Callable[[Telegram], Awaitable[None]]
MessageCallbackType = Callable[[Telegram], None]
