_u = _.noConflict();
//note, check use of "link" in getRelated Function which may cause scopoing issue with d3 link references>?
_cw_domain_path = "https://domain.com/cityworks/";

$.urlParam = function (name) {
    var results = new RegExp('[\?&]' + name + '=([^&#]*)')
                      .exec(window.location.search);
    return (results !== null) ? results[1] || 0 : false;
}

function loadAPIData(input) {
  return new Promise(resolve => {
    $.get(_cw_domain_path + 'services/General/ActivityLink/ByActivitySids?data={"ActivityType":1,"ActivitySids":[' + input + ']}', function(data) {
      if(((typeof(data.Value)!='undefined') && (data.Value.length>0)) || (data.Value == null)) {
        resolve(data.Value);
      } else  {
        throw new Error("API did not return a result");
      }
    });
  });
}

function storeThis(parentSID, childSID, whichOne, theStore, callback) {
  let includesParent = false;
  let includesChild = false;
  _u.forEach(theStore, function(v, k) {
    if(theStore[k].parent==parentSID) {
      if(!_u.includes(theStore[k].children, childSID)) {
        theStore[k].children.push(childSID);
      }
      includesParent = true;
    } else if(theStore[k].parent==childSID) {
      includesChild = true;
    }
    if(theStore[k].parent==whichOne) {
      theStore[k].done = 'yes';
    }
  });
  if(!includesParent) {
    theStore.push({
      parent: parentSID,
      done: (whichOne==parentSID) ? 'yes' : 'no',
      children: [childSID]
    });
    includesParent = true;
  }
  if(!includesChild) {
    theStore.push({
      parent: childSID,
      done: (whichOne==childSID) ? 'yes' : 'no',
      children: []
    });
    includesChild = true;
  }
  callback(theStore);
}

function getRelated(related, theStore) {
  return new Promise(resolve => {
    loadAPIData(related).then(resp => {
      _u.forEach(resp, function(link) {
        switch(link.LinkType) {
            case 1:
              storeThis(link.SourceSid, link.DestSid, related, theStore, function(ts) {
                theStore = ts;
              });
              break;
        }
      });
      let finding = _u.find(theStore, ['done', 'no']);
      if(typeof(finding)!=='undefined') {
        getRelated(finding.parent, theStore).then(resp => {
          resolve(resp);
        });
      } else {
        resolve(theStore);
      }
    }).catch(err => {
      throw err;
    });
  });
}

var store = [];
if($.urlParam('caobjectid')) {
  var input = $.urlParam('caobjectid');
  getRelated(input, store).then(resp => {
    var final = [];
    _u.forEach(resp, (v, k) => {
      final[v.parent] = v.children;
    });
     //console.log(final, 'DONE!');

    createRelateList(final).then(nodeRel => {
      // console.log('nodeRel', nodeRel);
     var outputNodeList  = [];
     var objKeys = Object.keys(final);
     createNodeList(objKeys, outputNodeList).then(caseIdsAndNumbers => {
       // console.log(caseIdsAndNumbers, 'caseIdsAndNumbers');
       displayNodeVisual(caseIdsAndNumbers, nodeRel);
     });
    })
  });
}

//Helper func:
function loadAPICaseNum(input) {
  return new Promise(resolve => {
    $.get(_cw_domain_path + 'services/Pll/CaseObject/ByIds?data={CaObjectIds:[' + input + ']}', function(data) {
      if(((typeof(data.Value)!='undefined') || (data.Value == null)) && (data.Value.length>0)) {
        resolve(data.Value[0].CaseNumber);
      } else  {
        throw new Error("API did not return a result");
      }
    });
  });
}

function iterateInputNodes(theNodes, theNodeList, callback) {
  if(theNodes.length>0) {
    var k = theNodes.pop();
    loadAPICaseNum(k).then(resp=>{
      theNodeList.push({"ca_id":Number(k), "case_number":resp});
      callback(theNodes, theNodeList);
    });
  } else {
    callback(theNodes, theNodeList);
  }
}

function createNodeList(inputNodes, outputNodeList){
  return new Promise(resolve => {
    iterateInputNodes(inputNodes, outputNodeList, function(theNodes, theNodeList) {
      if(theNodes.length>0) {
        createNodeList(theNodes, theNodeList).then(rez => {
          resolve(rez);
        });
      } else {
        resolve(theNodeList);
      }
    });
  });
}

function createRelateList(inputNodes){
  return new Promise(resolve => {
    var outputNodeList  = [];
    _u.forEach(inputNodes, function(v, k) {
      if(typeof(v)=='object' && v.length > 0){
        // iterate through Array of child numbers, with each child as c
        _u.forEach(v, function(c) {
          outputNodeList.push({
            // add key, which is parent as source
            source : k,
            // add c, which is child, as dest
            dest : c,
            //add value 20 which is line length between nodes.
            value : 100
          });
        });
      }
    });
    resolve(outputNodeList);
  });
}

function displayNodeVisual(nodeListArray, nodeRelateArray){
  var svg = d3.select("svg"),
      width = +svg.attr("width"),
      height = +svg.attr("height");

  var color = d3.scaleOrdinal(d3.schemeCategory10);

  var simulation = d3.forceSimulation()//Good test case: 34 and 35
      .force("link", d3.forceLink().id(function(d) { return d.ca_id; }).strength(0))
      .force("charge", d3.forceCollide().radius(10).strength(.3))
      .force("radius", forcePolar().strength(.2).radius(function(d, bump)//TODO: handle radius for nodes after depth 1
      {
        let parentIds = {};
        let myParentId = 0;
        for(let index = 0; index < graph.links.length; index++)
        {
          if(graph.links[index].target["ca_id"] === d["ca_id"])
          {
            myParentId = graph.links[index].source["ca_id"];
          }

          if(parentIds[graph.links[index].source["ca_id"]] === undefined)
          {
            parentIds[graph.links[index].source["ca_id"]] = 0;
          }

          parentIds[graph.links[index].source["ca_id"]] = parentIds[graph.links[index].source["ca_id"]] + 1;
        }
        
        if(myParentId === 0)
        {
          return .2
        }

        let myGrandParentId = 0;
        for(let index = 0; index < graph.links.length; index++)
        {
          if(graph.links[index].target["ca_id"] === myParentId)
          {
            myGrandParentId = graph.links[index].source["ca_id"];
          }
        }

        let numSiblings = parentIds[myParentId];

        let angle = (90 + bump + bump)/numSiblings;
        let givenArcLength = 3000;//1290;

        if(myGrandParentId === 0)
        {
          angle = 360/numSiblings;
          givenArcLength = 3000;
        }
        
        
        let radius = givenArcLength/angle;

        if(radius - bump <= 100)
        {
          return 100
        }

        //console.log((radius-bump)*angle);

        return radius - bump
      }).angle(function(d, bump)//TODO: test angles for nodes after depth 1
      {
        let parentIds = {};
        let myParentId = 0;
        let mySiblingIndex = 0;
        for(let index = 0; index < graph.links.length; index++)
        {
          if(graph.links[index].target["ca_id"] === d["ca_id"])
          {
            //console.log(graph.links[index].source);
            myParentId = graph.links[index].source["ca_id"];

            if(!(parentIds[graph.links[index].source["ca_id"]] === undefined))
            {
              mySiblingIndex = parentIds[graph.links[index].source["ca_id"]];
            }
          }

          if(parentIds[graph.links[index].source["ca_id"]] === undefined)
          {
            parentIds[graph.links[index].source["ca_id"]] = 0;
          }

          parentIds[graph.links[index].source["ca_id"]] = parentIds[graph.links[index].source["ca_id"]] + 1;
        }

        if(myParentId === 0)
        {
          return 0
        }
        
        let myGrandParentId = 0;
        for(let index = 0; index < graph.links.length; index++)
        {
          if(graph.links[index].target["ca_id"] === myParentId)
          {
            myGrandParentId = graph.links[index].source["ca_id"];
          }
        }

        let myParentX = 0;
        let myParentY = 0;
        let myGrandParentX = 0;
        let myGrandParentY = 0;
        for(let index = 0; index < graph.nodes.length; index++)
        {
          if(graph.nodes[index]["ca_id"] === myParentId)
          {
            myParentX = graph.nodes[index]["x"];
            myParentY = graph.nodes[index]["y"];
          }

          if(graph.nodes[index]["ca_id"] === myGrandParentId)
          {
            myGrandParentX = graph.nodes[index]["x"];
            myGrandParentY = graph.nodes[index]["y"];
          }
        }

        let numSiblings = parentIds[myParentId];
        //console.log(numSiblings);
        if(myGrandParentId === 0)
        {
          return (360 * (1/numSiblings) * (d["index"]%numSiblings))
        }

        let theta = (Math.atan2(myParentY - myGrandParentY, myParentX - myGrandParentX) * (180/Math.PI)) + 180;
        //console.log(theta);
        let adjustment = 45 + bump;
        if(adjustment > 90)
        {
          adjustment = 90;
        }
        let thetaMax = theta + adjustment;
        let thetaMin = theta - adjustment;

        let thetaRange = thetaMax - thetaMin;

        //If we are an only child, then set the sibling index to 0.5 so we use the actual angle exactly in the middle ie (thetaRange * 0.5 + thetaMin) and not (0 + thetaMin)
        if(numSiblings === 1)
        {
          mySiblingIndex = 0.5;
        }
        //console.log("mySiblingIndex: " + mySiblingIndex);
        return ((thetaRange * (1/numSiblings) * (mySiblingIndex)) + thetaMin) + 180
        //return 90 + 45
      }).x(function(d)
      {
        let myParentId = 0;
        for(let index = 0; index < graph.links.length; index++)
        {
          if(graph.links[index].target["ca_id"] === d["ca_id"])
          {
            myParentId = graph.links[index].source["ca_id"];
          }
        }

        for(let index = 0; index < graph.nodes.length; index++)
        {
          
          if(graph.nodes[index]["ca_id"] === myParentId)
          {
            return graph.nodes[index]["x"]
          }
        }

        return 0
      }).y(function(d)
      {
        let myParentId = 0;
        for(let index = 0; index < graph.links.length; index++)
        {
          if(graph.links[index].target["ca_id"] === d["ca_id"])
          {
            myParentId = graph.links[index].source["ca_id"];
          }
        }

        for(let index = 0; index < graph.nodes.length; index++)
        {
          if(graph.nodes[index]["ca_id"] === myParentId)
          {
            return graph.nodes[index]["y"]
          }
        }

        return 0
      })
      )
      ;

    var graph = getData(nodeListArray, nodeRelateArray);
    graph.links = graph.links.map(function(ele) {return {
      source: ele.source, target: ele.dest, value: +ele.value
    }
  });

  //Make the overflow visible so that when the graph goes off the left side of the svg it will still be visible
  document.getElementsByTagName("svg")[0].style.overflow = "visible";

  var link = svg.append("g")
      .attr("class", "links")
    .selectAll("line")
    .data(graph.links)
    .enter().append("line")
      .attr("stroke-width", function(d) { return Math.sqrt(d.value); });


    var node = svg.append("g")
        .attr("class", "nodes")
      .selectAll("g")
      .data(graph.nodes)
      .enter().append("g")

    var circles = node.append("circle")
        .attr("r", function(d)
        {
          let myParentId = 0;
          for(let index = 0; index < graph.links.length; index++)
          {
            if(graph.links[index].target === d["ca_id"])
            {
              myParentId = graph.links[index].source;
            }
          }

          if(myParentId === 0)
          {
            return 0
          }

          return 5
        })  //WAS 5 ORIGINALLY
        .attr("fill", function(d)
        {
           //return color(d.ca_id); 

           let myParentId = 0;
          for(let index = 0; index < graph.links.length; index++)
          {
            if(graph.links[index].target === d["ca_id"])
            {
              myParentId = graph.links[index].source;
            }
          }

          if(myParentId === 0)
          {
            return "#FF0000"
          }

          return "#0000FF"

        });

    let sqWidth = 9;
    let sqHeight = 9;
    var squares = node.append("rect")
        .attr("width", function(d)
        {
          let myParentId = 0;
          for(let index = 0; index < graph.links.length; index++)
          {
            if(graph.links[index].target === d["ca_id"])
            {
              myParentId = graph.links[index].source;
            }
          }

          if(myParentId === 0)
          {
            return sqWidth
          }

          return 0
        })
        .attr("height", function(d)
        {
          let myParentId = 0;
          for(let index = 0; index < graph.links.length; index++)
          {
            if(graph.links[index].target === d["ca_id"])
            {
              myParentId = graph.links[index].source;
            }
          }

          if(myParentId === 0)
          {
            return sqHeight
          }

          return 0
        })
        .attr("fill", function(d)
        {
           let myParentId = 0;
          for(let index = 0; index < graph.links.length; index++)
          {
            if(graph.links[index].target === d["ca_id"])
            {
              myParentId = graph.links[index].source;
            }
          }

          if(myParentId === 0)
          {
            return "#FF0000"
          }

          return "#0000FF"

        })
        .attr("x", function(d)
        {
          return (-1.0 * (sqWidth/2.0))
        })
        .attr("y", function(d)
        {
          return (-1.0 * (sqHeight/2.0))
        });;

  //Springyness
/*         .call(d3.drag()
            .on("start", dragstarted)
            .on("drag", dragged)
            .on("end", dragended));
*/

    var lables = node.append("text")
        //.text(function(d) {
          //return d.case_number;
        //})
        .attr('x', 6)
        .attr('y', 3);

    var hyperLinks = lables.append("a")
        .text(function(d) {
          return d.case_number;
        })
        .attr("href", function(d){ return _cw_domain_path + "apps/respond/case/edit/" + d.ca_id })
        .attr("target", "_blank");

    node.append("title")
        .text(function(d) { return d.ca_id; });

    simulation
        .nodes(graph.nodes)
        .on("tick", ticked);

    simulation.force("link")
        .links(graph.links);

        var xs = {};
        var ys = {};
        var stops = {};

        function ticked() {
          link
              .attr("x1", function(d) { return d.source.x + (width / 2); })
              .attr("y1", function(d) { return d.source.y + (height / 2); })
              .attr("x2", function(d) { return d.target.x + (width / 2); })
              .attr("y2", function(d) { return d.target.y + (height / 2); });

          node
              .attr("transform", function(d) {
                if(!(xs[d.ca_id == null]))
                {
                  if(Math.abs(xs[d.ca_id] - d.x) <= 0.5
                  && Math.abs(ys[d.ca_id] - d.y) <= 0.5)
                  {
                    stops[d.ca_id] = true;
                  }
                  else
                  {
                    stops[d.ca_id] = false;
                  }
                }

                xs[d.ca_id] = d.x;
                ys[d.ca_id] = d.y;
                return "translate(" + (d.x + (width / 2)) + "," + (d.y + (height / 2)) + ")"
              });

          if(Object.entries(stops).length === graph.nodes.length)
          {
            for(let [key, value] of Object.entries(stops))
            {
              if(value === false)
              {
                return
              }
            }
            simulation.stop();
            done();
          }
        }

        function done() {
          //Make sure the graph doesn't go off the left side of the screen
          if(document.getElementsByClassName("links")[0].getBoundingClientRect().x < 0
          && document.getElementsByClassName("links")[0].getBoundingClientRect().x < document.getElementsByClassName("nodes")[0].getBoundingClientRect().x)
          {
            document.getElementsByTagName("svg")[0].style.marginLeft = Math.abs(document.getElementsByClassName("links")[0].getBoundingClientRect().x);
          }
          else if(document.getElementsByClassName("nodes")[0].getBoundingClientRect().x < 0
          && document.getElementsByClassName("nodes")[0].getBoundingClientRect().x < document.getElementsByClassName("links")[0].getBoundingClientRect().x)
          {
            document.getElementsByTagName("svg")[0].style.marginLeft = Math.abs(document.getElementsByClassName("nodes")[0].getBoundingClientRect().x);
          }

          //Make sure the graph doesn't go off the top of the screen
          if(document.getElementsByClassName("links")[0].getBoundingClientRect().y < 0
          && document.getElementsByClassName("links")[0].getBoundingClientRect().y < document.getElementsByClassName("nodes")[0].getBoundingClientRect().y)
          {
            document.getElementsByTagName("svg")[0].style.marginTop = Math.abs(document.getElementsByClassName("links")[0].getBoundingClientRect().y);
          }
          else if(document.getElementsByClassName("nodes")[0].getBoundingClientRect().y < 0
          && document.getElementsByClassName("nodes")[0].getBoundingClientRect().y < document.getElementsByClassName("links")[0].getBoundingClientRect().y)
          {
            document.getElementsByTagName("svg")[0].style.marginTop = Math.abs(document.getElementsByClassName("nodes")[0].getBoundingClientRect().y);
          }

          //We also need to make sure the bottom of the svg is in the same place as the graph to make sure scrolling works correctly when necessary
          let linkBottom = document.getElementsByClassName("links")[0].getBoundingClientRect().bottom;
          let nodeBottom = document.getElementsByClassName("nodes")[0].getBoundingClientRect().bottom;
          if(linkBottom > nodeBottom)
          {
            document.getElementsByTagName("svg")[0].style.height = "" + linkBottom;
          }
          else
          {
            document.getElementsByTagName("svg")[0].style.height = "" + nodeBottom;
          }

          //We also need to make sure the right of the svg is in the same place as the graph to make sure scrolling works correctly when necessary
          let linkRight = document.getElementsByClassName("links")[0].getBoundingClientRect().right;
          let nodeRight = document.getElementsByClassName("nodes")[0].getBoundingClientRect().right;
          if(linkRight > nodeRight)
          {
            document.getElementsByTagName("svg")[0].style.width = "" + linkRight;
          }
          else
          {
            document.getElementsByTagName("svg")[0].style.width = "" + nodeRight;
          }
        }

        function dragstarted(d) {
          if (!d3.event.active) simulation.alphaTarget(0.3).restart();
          d.fx = d.x;
          d.fy = d.y;
        }

        function dragged(d) {
          d.fx = d3.event.x;
          d.fy = d3.event.y;
        }

        function dragended(d) {
          if (!d3.event.active) simulation.alphaTarget(0);
          d.fx = null;
          d.fy = null;
        }



}

function getData(arrayListNodes, arrayRelateNode) {
  //prep Node json
  var data = {
    nodes: [],
    links: []
  };

  _u.forEach(arrayListNodes, function(v) {
    //console.log("ca_id", v.ca_id, "case_number", v.case_number);
    data.nodes.push({"ca_id":v.ca_id, "case_number":v.case_number});
  });
  /*
  for( let i=0; i< arrayListNodes.length(); i++){
    data.nodes.push({"ca_id":i.ca_id, "case_number":i.case_number});
    console.log("ca_id", i.ca_id, "case_number", i.case_number);
  }*/

  _u.forEach(arrayRelateNode, function(v) {
    data.links.push({"source":v.source, "dest":v.dest, "value":"10"});
  });

  return data;
}


var bumpValue = 0;
forcePolar = function(radius, x, y, angle) {
  var constant = function(x) {
    return function() {
      return x;
    };
  };

  var nodes,
    strength = constant(0.1),
    strengths,
    radii,
    angles,
    xs,
    ys;

  if (angle !== undefined && angle !== null && typeof angle !== "function")
    angle = constant(+angle);
  if (radius !== undefined && radius !== null && typeof radius !== "function")
    radius = constant(+radius);
  if (typeof x !== "function") x = constant(x == null ? 0 : +x);
  if (typeof y !== "function") y = constant(y == null ? 0 : +y);

  function force(alpha) {
    for (var i = 0, n = nodes.length; i < n; ++i) {
      var node = nodes[i],
        myParentX = x(nodes[i]),
        myParentY = y(nodes[i]),
        dx = node.x - myParentX || 1e-6,
        dy = node.y - myParentY || 1e-6,
        r = Math.hypot(dy, dx);

      if (radius) {
        var k = ((radius(node, bumpValue) - r) * strengths[i] * alpha) / r;
        node.vx += dx * k;
        node.vy += dy * k;
      }

      if (angle) {
        var a = Math.atan2(dy, dx),
          diff = (angle(node, bumpValue) * (Math.PI/180)) - a,
          k = r * Math.sin(diff) * (strengths[i] * alpha);

        // the factor below augments the "unease" for points that are opposite the correct direction:
        // in that case, though sin(diff) is small, tan(diff/2) is very high
        k *= Math.hypot(1, Math.tan(diff / 2));

        node.vx += -k * Math.sin(a);
        node.vy += k * Math.cos(a);
      }
    }
  }

  function initialize() {
    if (!nodes) return;
    var i,
      n = nodes.length;
    strengths = new Array(n);
    angles = new Array(n);
    radii = new Array(n);
    xs = new Array(n);
    ys = new Array(n);
    for (i = 0; i < n; ++i) {
      if (angle) angles[i] = +angle(nodes[i], i, nodes) * (Math.PI / 180);
      if (radius) radii[i] = +radius(nodes[i], i, nodes);
      xs[i] = +x(nodes[i], i, nodes);
      ys[i] = +y(nodes[i], i, nodes);
      strengths[i] =
        (angle && isNaN(angles[i])) || (radius && isNaN(radii[i]))
          ? 0
          : +strength(nodes[i], i, nodes);
    }
  }

  force.initialize = function(_) {
    (nodes = _), initialize();
  };

  force.strength = function(_) {
    return arguments.length
      ? ((strength = typeof _ === "function" ? _ : constant(+_)),
        initialize(),
        force)
      : strength;
  };

  force.angle = function(_) {
    return arguments.length
      ? ((angle = typeof _ === "function" ? _ : constant(+_)),
        initialize(),
        force)
      : angle;
  };

  force.radius = function(_) {
    return arguments.length
      ? ((radius = typeof _ === "function" ? _ : constant(+_)),
        initialize(),
        force)
      : radius;
  };

  force.x = function(_) {
    return arguments.length
    ? (x = typeof _ === "function" ? _ : constant(+_),
      initialize(),
      force)
    : x;
  };

  force.y = function(_) {
    return arguments.length
    ? (y = typeof _ === "function" ? _ : constant(+_),
      initialize(),
      force)
    : y;
  };

  return force;
}