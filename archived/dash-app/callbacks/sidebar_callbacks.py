import dash
from dash import Input, Output, State

def register_sidebar_callbacks(app):
    @app.callback(
        Output("offcanvas-sidebar", "is_open"),
        Input("open-sidebar-btn", "n_clicks"),
        [State("offcanvas-sidebar", "is_open")],
    )
    def toggle_sidebar(n1, is_open):
        if n1:
            return not is_open
        return is_open

    @app.callback(
        Output('sidebar-collapsed-store', 'data'),
        Input('collapse-sidebar-btn', 'n_clicks'),
        State('sidebar-collapsed-store', 'data'),
        prevent_initial_call=True
    )
    def toggle_sidebar_collapse(n_clicks, is_collapsed):
        if n_clicks:
            return not is_collapsed
        return dash.no_update

    @app.callback(
        Output('sidebar', 'style'),
        Input('sidebar-collapsed-store', 'data')
    )
    def update_sidebar_style(is_collapsed):
        if is_collapsed:
            return {"width": "0px", "height": "100vh", "transition": "width 0.3s", "overflow": "hidden"}
        else:
            return {"width": "280px", "height": "100vh", "transition": "width 0.3s", "overflow": "hidden"}
