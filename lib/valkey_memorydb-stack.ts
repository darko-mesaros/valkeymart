import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as memorydb from 'aws-cdk-lib/aws-memorydb';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as assets from 'aws-cdk-lib/aws-ecr-assets';
import * as apprunner from '@aws-cdk/aws-apprunner-alpha';
import path = require('path');

export class ValkeyMemorydbStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // vpc
    const vpc = new ec2.Vpc(this, 'valkeyVpc',{
      maxAzs: 2,
      ipAddresses: ec2.IpAddresses.cidr('10.0.0.0/21'),
      subnetConfiguration: [
        {
          subnetType: ec2.SubnetType.PUBLIC,
          name: 'Public',
          cidrMask: 24,
        }
      ]
    });

    // Security Group
    const valkeySecurtyGroup = new ec2.SecurityGroup(this, 'valkeySecurtyGroup',
      { 
        vpc,
        allowAllOutbound: true,
      });

    valkeySecurtyGroup.addIngressRule(
      ec2.Peer.ipv4(vpc.vpcCidrBlock),
      ec2.Port.tcp(6379)
    );


    // MemoryDB
    // SubnetGroup
    const selectedSubnets = vpc.selectSubnets({
      subnetType: ec2.SubnetType.PUBLIC,
    });
    const valkeySubnetGroup = new memorydb.CfnSubnetGroup(this, 'valkeySubnetGroup',{
      subnetGroupName: 'valkey-subnet-group',
      subnetIds: selectedSubnets.subnetIds,
    });
    
    // Manually managing dependencies - just in case
    valkeySubnetGroup.node.addDependency(vpc);
    
    // Cluster
    // 🔴 This takes a LONG time to launch 🔴
    const valkeyCluster = new memorydb.CfnCluster(this, 'valkeyCluster',{
      clusterName: 'valkey-demo-cluster',
      aclName: 'open-access',
      parameterGroupName: 'default.memorydb-redis7', // CHANGE THIS TO default.memorydb-valkey7 FOR VALKEY
      nodeType: 'db.t4g.small',
      numShards: 1,
      numReplicasPerShard: 1,
      // Most likely there will be a 'engine' parameter here
      engineVersion: '7.1', // CHANGE THIS TO 7.2 FOR VALKEY
      port: 6379,
      tlsEnabled: true,
      subnetGroupName: valkeySubnetGroup.subnetGroupName,
      securityGroupIds: [
        valkeySecurtyGroup.securityGroupId
      ]
    });
    
    // Manually managing dependencies - just in case
    valkeyCluster.node.addDependency(valkeySubnetGroup);
    valkeyCluster.node.addDependency(valkeySecurtyGroup);

    // AppRunner 
    const valkeyMartVpcConnector = new apprunner.VpcConnector(this, 'valkeyMartVpcConnector', {
      vpc,
      vpcSubnets: vpc.selectSubnets({subnetType: ec2.SubnetType.PUBLIC}),
      vpcConnectorName: 'valkeyMartVpcConnector'
    });
    const valkeyMartAsset = new assets.DockerImageAsset(this, 'valkeyMartAsset', {
      directory: path.join(__dirname, '../assets/valkeymart')
    });
    const valkeyMart = new apprunner.Service(this, 'valkeyMart', {
      vpcConnector: valkeyMartVpcConnector,
      source: apprunner.Source.fromAsset({
        asset: valkeyMartAsset,
        imageConfiguration: {
          port: 5000,
          environmentVariables: {
            REDIS_URL: valkeyCluster.attrClusterEndpointAddress.toString(),
            // TODO: Need to fix the REDIS_PORT. As by default CDK creates a Fn::GetAtt to the ClusterEndpoint.Port Value
            // which will always be an integer. Not really sure how to fix this.
            //
            //REDIS_PORT: cdk.Token.asString(valkeyCluster.attrClusterEndpointPort),
            SSL: 'True',
          }
        }
      })

    });


  }
}
