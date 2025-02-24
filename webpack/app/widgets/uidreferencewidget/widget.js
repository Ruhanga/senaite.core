import React from "react"
import ReactDOM from "react-dom"

import ReferenceWidgetAPI from "./api.js"
import ReferenceField from "./components/ReferenceField.js"
import ReferenceResults from "./components/ReferenceResults.js"
import References from "./components/References.js"


class UIDReferenceWidgetController extends React.Component {

  constructor(props) {
    super(props);

    // Internal state
    this.state = {
      results: [],  // `items` list of search results coming from `senaite.jsonapi`
      searchterm: "",  // the search term that was entered by the user
      loading: false,  // loading flag when searching for results
      count: 0,  // count of results (coming from `senaite.jsonapi`)
      page: 1,  // current page (coming from `senaite.jsonapi`)
      pages: 1,  // number of pages (coming from `senaite.jsonapi`)
      next_url: null,  // next page API URL (coming from `senaite.jsonapi`)
      prev_url: null,  // previous page API URL (coming from `senaite.jsonapi`)
      b_start: 1,  // batch start for pagination (see `senaite.jsonapi.batch`)
      focused: 0,  // current result that has the focus
    }

    // Root input HTML element
    let el = props.root_el;

    // Data keys located at the root element
    // -> initial values are set from the widget class
    const data_keys = [
      "id",
      "name",
      "uids",
      "api_url",
      "records",
      "catalog",
      "query",
      "columns",
      "display_template",
      "limit",
      "multi_valued",
      "disabled",
      "readonly",
    ]

    // Query data keys and set state with parsed JSON value
    for (let key of data_keys) {
      let value = el.dataset[key];
      this.state[key] = this.parse_json(value);
    }

    // Initialize communication API with the API URL
    this.api = new ReferenceWidgetAPI({
      api_url: this.state.api_url,
    });

    // Bind callbacks to current context
    this.search = this.search.bind(this);
    this.goto_page = this.goto_page.bind(this);
    this.clear_results = this.clear_results.bind(this);
    this.select = this.select.bind(this);
    this.select_focused = this.select_focused.bind(this);
    this.deselect = this.deselect.bind(this);
    this.navigate_results = this.navigate_results.bind(this);
    this.on_keydown = this.on_keydown.bind(this);
    this.on_click = this.on_click.bind(this);

    // dev only
    window.widget = this;

    return this
  }

  componentDidMount() {
    // Bind event listeners of the document
    document.addEventListener("keydown", this.on_keydown, false);
    document.addEventListener("click", this.on_click, false)
  }

  componentWillUnmount() {
    // Remove event listeners of the document
    document.removeEventListener("keydown", this.on_keydown, false);
    document.removeEventListener("click", this.on_click, false);
  }

  /*
   * JSON parse the given value
   *
   * @param {String} value: The JSON value to parse
   */
  parse_json(value) {
    try {
      return JSON.parse(value)
    } catch (error) {
      console.error(`Could not parse "${value}" to JSON`);
    }
  }

  is_disabled() {
    if (this.state.disabled) {
      return true;
    }
    if (this.state.readonly) {
      return true;
    }
    if (!this.state.multi_valued && this.state.uids.length > 0) {
      return true;
    }
    return false;
  }

  /*
   * Create a query object for the API
   *
   * This method prepares a query from the current state variables,
   * which can be used to call the `api.search` method.
   *
   * @param {Object} options: Additional options to add to the query
   * @returns {Object} The query object
   */
  make_query(options) {
    options = options || {};
    return Object.assign({
      q: this.state.searchterm,
      limit: this.state.limit,
      complete: 1,
    }, options, this.state.query);
  }

  /*
   * Execute a search query and set the results to the state
   *
   * @param {Object} url_params: Additional search params for the API search URL
   * @returns {Promise}
   */
  fetch_results(url_params) {
    url_params = url_params || {};
    // prepare the server request
    let self = this;
    let query = this.make_query();
    this.toggle_loading(true);
    let promise = this.api.search(this.state.catalog, query, url_params);
    promise.then(function(data) {
      console.debug("ReferenceWidgetController::fetch_results:GOT DATA: ", data);
      self.set_results_data(data);
      self.toggle_loading(false);
    });
    return promise;
  }

  /*
   * Execute a search for the given searchterm
   *
   * @param {String} searchterm: The value entered into the search field
   * @returns {Promise}
   */
  search(searchterm) {
    if (!searchterm && this.state.results.length > 0) {
      this.state.searchterm = "";
      return;
    }
    console.debug("ReferenceWidgetController::search:searchterm:", searchterm);
    // set the searchterm directly to avoid re-rendering
    this.state.searchterm = searchterm || "";
    return this.fetch_results();
  }

  /*
   * Fetch results of a page
   *
   * @param {Integer} page: The page to fetch
   * @returns {Promise}
   */
  goto_page(page) {
    page = parseInt(page);
    let limit = parseInt(this.state.limit)
    // calculate the beginning of the page
    // Note: this is the count of previous items that are excluded
    let b_start = page * limit - limit;
    return this.fetch_results({b_start: b_start});
  }

  /*
   * Add the UID of a search result to the state
   *
   * @param {String} uid: The selected UID
   * @returns {Array} uids: current selected UIDs
   */
  select(uid) {
    console.debug("ReferenceWidgetController::select:uid:", uid);
    // create a copy of the selected UIDs
    let uids = [].concat(this.state.uids);
    // Add the new UID if it is not selected yet
    if (uids.indexOf(uid) == -1) {
      uids.push(uid);
    }
    this.setState({uids: uids});
    if (uids.length > 0 && !this.state.multi_valued) {
      this.clear_results();
    }
    return uids;
  }

  /*
   * Add/remove the focused result
   *
   */
  select_focused() {
    console.debug("ReferenceWidgetController::select_focused");
    let focused = this.state.focused;
    let result = this.state.results.at(focused);
    if (result) {
      let uid = result.uid;
      if (this.state.uids.indexOf(uid) == -1) {
        this.select(uid);
      } else {
        this.deselect(uid);
      }
    }
  }

  /*
   * Remove the UID of a reference from the state
   *
   * @param {String} uid: The selected UID
   * @returns {Array} uids: current selected UIDs
   */
  deselect(uid) {
    console.debug("ReferenceWidgetController::deselect:uid:", uid);
    let uids = [].concat(this.state.uids);
    let pos = uids.indexOf(uid);
    if (pos > -1) {
      uids.splice(pos, 1);
    }
    this.setState({uids: uids});
    return uids;
  }

  /*
   * Navigate the results either up or down
   *
   * @param {String} direction: either up or down
   */
  navigate_results(direction) {
    let page = this.state.page;
    let pages = this.state.pages;
    let results = this.state.results;
    let focused = this.state.focused;
    let searchterm = this.state.searchterm;

    console.debug("ReferenceWidgetController::navigate_results:focused:", focused);

    if (direction == "up") {
      if (focused > 0) {
        this.setState({focused: focused - 1});
      } else {
        this.setState({focused: 0});
        if (page > 1) {
          this.goto_page(page - 1);
        }
      }
    }

    else if (direction == "down") {
      if (this.state.results.length == 0) {
        this.search(searchterm);
      }
      if (focused < results.length - 1) {
        this.setState({focused: focused + 1});
      } else {
        this.setState({focused: 0});
        if (page < pages) {
          this.goto_page(page + 1);
        }
      }
    }

    else if (direction == "left") {
      this.setState({focused: 0});
      if (page > 0) {
        this.goto_page(page - 1);
      }
    }

    else if (direction == "right") {
      this.setState({focused: 0});
      if (page < pages) {
        this.goto_page(page + 1);
      }
    }
  }

  /*
   * Toggle loading state
   *
   * @param {Boolean} toggle: The loading state to set
   * @returns {Boolean} toggle: The current loading state
   */
  toggle_loading(toggle) {
    if (toggle == null) {
      toggle = false;
    }
    this.setState({
      loading: toggle
    });
    return toggle;
  }

  /*
   * Set results data coming from `senaite.jsonapi`
   *
   * @param {Object} data: JSON search result object returned from `senaite.jsonapi`
   */
  set_results_data(data) {
    data = data || {};
    let items = data.items || [];

    let records = Object.assign(this.state.records, {})
    // update state records
    for (let item of items) {
      let uid = item.uid;
      records[uid] = item;
    }

    this.setState({
      records: records,
      results: items,
      count: data.count || 0,
      page: data.page || 1,
      pages: data.pages || 1,
      next_url: data.next || null,
      prev_url: data.previous || null,
    });
  }

  /*
   * Clear results from the state
   */
  clear_results() {
    this.setState({
      results: [],
      count: 0,
      page: 1,
      pages: 1,
      next_url: null,
      prev_url: null,
    });
  }

  /*
   * ReactJS event handler for keydown event
   */
  on_keydown(event){
    // clear results when ESC key is pressed
    if(event.keyCode === 27) {
      this.clear_results();
    }
  }

  /*
   * ReactJS event handler for click events
   */
  on_click(event) {
    // clear results when clicked outside of the widget
    let widget = this.props.root_el;
    let target = event.target;
    if (!widget.contains(target)) {
      this.clear_results();
    }
  }

  render() {
    return (
        <div className="uidreferencewidget">
          <References
            uids={this.state.uids}
            records={this.state.records}
            display_template={this.state.display_template}
            name={this.state.name}
            on_deselect={this.deselect}
          />
          <ReferenceField
            className="form-control"
            name="uidreference-search"
            disabled={this.is_disabled()}
            on_search={this.search}
            on_clear={this.clear_results}
            on_focus={this.search}
            on_arrow_key={this.navigate_results}
            on_enter={this.select_focused}
          />
          <ReferenceResults
            className="position-absolute shadow border rounded bg-white mt-1 p-1"
            columns={this.state.columns}
            uids={this.state.uids}
            searchterm={this.state.searchterm}
            results={this.state.results}
            focused={this.state.focused}
            count={this.state.count}
            page={this.state.page}
            pages={this.state.pages}
            next_url={this.state.next_url}
            prev_url={this.state.prev_url}
            on_select={this.select}
            on_page={this.goto_page}
            on_clear={this.clear_results}
          />
        </div>
    );
  }
}

export default UIDReferenceWidgetController;
