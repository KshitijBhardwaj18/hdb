"""MongoDB Atlas cluster provisioning and VPC peering."""

import pulumi
import pulumi_mongodbatlas as atlas
import pulumi_aws as aws
from dataclasses import dataclass
from typing import Optional


@dataclass
class MongoAtlasResult:
    """Result of MongoDB Atlas provisioning."""
    connection_string: pulumi.Output[str]
    project_id: pulumi.Output[str]


def provision_atlas_cluster(
    customer_id: str,
    mongo_config,
    vpc_id: pulumi.Input[str],
    vpc_cidr: str,
    route_table_ids: list[pulumi.Input[str]],
    node_security_group_id: pulumi.Input[str],
    aws_account_id: str,
    aws_region: str,
    aws_provider: aws.Provider,
) -> MongoAtlasResult:
    """Provision MongoDB Atl cluster with VPC peering.

    Supports two modes:
    - 'atlas': Create new project + cluster + db user + peering
    - 'atlas-peering': Peer to existing project/cluster
    """

    # Configure Atlas provider
    atlas_provider = atlas.Provider(
        f"{customer_id}-atlas-provider",
        client_id=mongo_config.atlas_client_id,
        client_secret=mongo_config.atlas_client_secret,
    )

    opts = pulumi.ResourceOptions(provider=atlas_provider)

    if mongo_config.mode == "atlas":
        project_name = mongo_config.atlas_project_name or f"{customer_id}-cortex"
        cluster_name = f"{customer_id}-cortex"

        # --- Project ---
        project = atlas.Project(
            f"{customer_id}-atlas-project",
            name=project_name,
            org_id=mongo_config.atlas_org_id,
            opts=opts,
        )
        project_id = project.id

        # --- Cluster ---
        cluster = atlas.Cluster(
            f"{customer_id}-atlas-cluster",
            project_id=project_id,
            name=cluster_name,
            provider_name="AWS",
            provider_instance_size_name=mongo_config.cluster_tier,
            provider_region_name=mongo_config.cluster_region,
            disk_size_gb=mongo_config.disk_size_gb,
            cluster_type="REPLICASET",
            opts=opts,
        )

        # --- Database User ---
        db_user = atlas.DatabaseUser(
            f"{customer_id}-atlas-db-user",
            project_id=project_id,
            username=mongo_config.db_username,
            password=mongo_config.db_password,
            auth_database_name="admin",
            roles=[
                atlas.DatabaseUserRoleArgs(
                    role_name="readWriteAnyDatabase",
                    database_name="admin",
                ),
            ],
            opts=opts,
        )

        connection_string = cluster.connection_strings.apply(
            lambda cs: cs[0].standard_srv if cs and len(cs) > 0 else ""
        )

    else:
        # atlas-peering mode: use existing project/cluster
        project_id = mongo_config.atlas_project_id

        # Look up existing cluster connection string
        existing_cluster = atlas.get_cluster(
            project_id=mongo_config.atlas_project_id,
            name=mongo_config.atlas_cluster_name,
            opts=pulumi.InvokeOptions(provider=atlas_provider),
        )
        connection_string = pulumi.Output.from_input(
            existing_cluster.connection_strings.private_srv
            or existing_cluster.connection_strings.standard_srv
            or ""
        )

    # --- VPC Peering ---

    atlas_region = mongo_config.cluster_region.replace("-", "_").upper()
    aws_accepter_region = aws_region

    def _get_container_id(pid: str) -> str:
        containers = atlas.get_network_containers(
            project_id=pid,
            provider_name="AWS",
            opts=pulumi.InvokeOptions(provider=atlas_provider),
        )
        matching = [c for c in containers.results if c.region_name == atlas_region]
        if not matching:
            raise ValueError(
                f"No Atlas network container found for region {atlas_region}. "
                "Ensure the Atlas cluster exists in this region."
            )
        return matching[0].id

    if mongo_config.mode == "atlas":
        container_id = pulumi.Output.all(cluster.id, project_id).apply(
            lambda args: _get_container_id(args[1])
        )
    else:
        container_id = _get_container_id(mongo_config.atlas_project_id)

    # Clean up stale VPC peerings with overlapping CIDRs from previous failed deployments
    def _cleanup_stale_peerings(pid: str) -> None:
        try:
            peerings = atlas.get_network_peerings(
                project_id=pid,
                opts=pulumi.InvokeOptions(provider=atlas_provider),
            )
            for p in peerings.results:
                if getattr(p, "route_table_cidr_block", None) == vpc_cidr:
                    peering_id = getattr(p, "peer_id", None) or getattr(p, "id", None)
                    if not peering_id:
                        continue
                    pulumi.log.warn(
                        f"Found stale peering {peering_id} with CIDR {vpc_cidr} "
                        f"(status: {getattr(p, 'status_name', 'unknown')}). Deleting via Atlas API..."
                    )
                    import urllib.request
                    import urllib.parse
                    import json
                    import base64

                    token_data = urllib.parse.urlencode({"grant_type": "client_credentials"}).encode()
                    creds = base64.b64encode(
                        f"{mongo_config.atlas_client_id}:{mongo_config.atlas_client_secret}".encode()
                    ).decode()
                    token_req = urllib.request.Request(
                        "https://cloud.mongodb.com/api/oauth/token", data=token_data
                    )
                    token_req.add_header("Content-Type", "application/x-www-form-urlencoded")
                    token_req.add_header("Authorization", f"Basic {creds}")
                    token_resp = json.loads(urllib.request.urlopen(token_req).read())
                    access_token = token_resp["access_token"]

                    del_req = urllib.request.Request(
                        f"https://cloud.mongodb.com/api/atlas/v2/groups/{pid}/peers/{peering_id}",
                        method="DELETE",
                    )
                    del_req.add_header("Authorization", f"Bearer {access_token}")
                    del_req.add_header("Accept", "application/vnd.atlas.2023-01-01+json")
                    try:
                        urllib.request.urlopen(del_req)
                        pulumi.log.info(f"Deleted stale peering {peering_id}")
                    except Exception as del_err:
                        pulumi.log.warn(f"Could not delete stale peering {peering_id}: {del_err}")
        except Exception as e:
            pulumi.log.warn(f"Could not check for stale peerings: {e}")

    if mongo_config.mode == "atlas":
        pulumi.Output.all(cluster.id, project_id).apply(
            lambda args: _cleanup_stale_peerings(args[1])
        )
    else:
        _cleanup_stale_peerings(mongo_config.atlas_project_id)

    # Create peering from Atlas side
    peering = atlas.NetworkPeering(
        f"{customer_id}-atlas-vpc-peering",
        project_id=project_id,
        container_id=container_id,
        provider_name="AWS",
        accepter_region_name=aws_accepter_region,
        aws_account_id=aws_account_id,
        vpc_id=vpc_id,
        route_table_cidr_block=vpc_cidr,
        opts=opts,
    )

    # Accept peering on AWS side
    peering_accepter = aws.ec2.VpcPeeringConnectionAccepter(
        f"{customer_id}-atlas-peering-accepter",
        vpc_peering_connection_id=peering.connection_id,
        auto_accept=True,
        opts=pulumi.ResourceOptions(provider=aws_provider),
    )

    # Get Atlas CIDR from the peering
    atlas_cidr = peering.atlas_cidr_block

    # Add routes to Atlas CIDR in each route table
    for i, rt_id in enumerate(route_table_ids):
        aws.ec2.Route(
            f"{customer_id}-atlas-route-{i}",
            route_table_id=rt_id,
            destination_cidr_block=atlas_cidr,
            vpc_peering_connection_id=peering.connection_id,
            opts=pulumi.ResourceOptions(
                provider=aws_provider,
                depends_on=[peering_accepter],
            ),
        )

    # Allow MongoDB traffic from Atlas CIDR
    aws.ec2.SecurityGroupRule(
        f"{customer_id}-atlas-sg-rule",
        type="ingress",
        from_port=27017,
        to_port=27017,
        protocol="tcp",
        cidr_blocks=[atlas_cidr],
        security_group_id=node_security_group_id,
        description="Allow MongoDB from Atlas VPC",
        opts=pulumi.ResourceOptions(
            provider=aws_provider,
            depends_on=[peering_accepter],
        ),
    )

    # Whitelist our VPC CIDR in Atlas
    atlas.ProjectIpAccessList(
        f"{customer_id}-atlas-ip-access",
        project_id=project_id,
        cidr_block=vpc_cidr,
        comment=f"BYOC VPC {customer_id}",
        opts=opts,
    )

    # Build connection URI with credentials
    if mongo_config.mode == "atlas":
        from urllib.parse import quote_plus

        _encoded_user = quote_plus(mongo_config.db_username)
        _encoded_pass = quote_plus(mongo_config.db_password or "")

        full_uri = connection_string.apply(
            lambda cs: cs.replace(
                "mongodb+srv://",
                f"mongodb+srv://{_encoded_user}:{_encoded_pass}@",
            ) + "/admin?retryWrites=true&w=majority"
            if cs else ""
        )
    else:
        # atlas-peering: inject credentials if provided
        if mongo_config.db_username and mongo_config.db_password:
            from urllib.parse import quote_plus

            _encoded_user = quote_plus(mongo_config.db_username)
            _encoded_pass = quote_plus(mongo_config.db_password)

            full_uri = connection_string.apply(
                lambda cs: cs.replace(
                    "mongodb+srv://",
                    f"mongodb+srv://{_encoded_user}:{_encoded_pass}@",
                )
                + "/admin?retryWrites=true&w=majority"
                if cs
                else ""
            )
        else:
            full_uri = connection_string

    return MongoAtlasResult(
        connection_string=full_uri,
        project_id=pulumi.Output.from_input(project_id),
    )
