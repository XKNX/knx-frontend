"""KNX Websocket API."""
from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant
import voluptuous as vol

from .const import KNX_DOMAIN


def register_websocket_api(hass: HomeAssistant) -> None:
    """Register the KNX Websocket API."""
    websocket_api.async_register_command(hass, ws_info)


@websocket_api.websocket_command(
    {
        vol.Required("type"): "knx_panel/info",
    }
)
@websocket_api.async_response
async def ws_info(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict,
) -> None:
    """Handle get info command."""
    xknx = hass.data[KNX_DOMAIN].xknx
    connection.send_result(
        msg["id"],
        {
            "version": xknx.version,
            "connected": xknx.connection_manager.connected.is_set(),
            "current_address": str(xknx.current_address),
        },
    )
